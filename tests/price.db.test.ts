// npm run test:db — price rows against the real database: the backfill, the
// loader, the public view. Everything inside a transaction that rolls back.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPrisma, type Tx } from '../src/lib/server/db.ts';
import { addDays, kampalaToday, nextMonday } from '../src/lib/build/week.ts';
import { floor, priceLabel } from '../src/lib/price.ts';
import { priceRow } from '../src/lib/server/price.ts';
import { loadWeek } from '../src/lib/server/register.ts';

const db = createPrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL!);
after(() => db.$disconnect());

const today = kampalaToday();
class Rollback extends Error {}
async function rolledBack(fn: (tx: Tx) => Promise<void>) {
	await db
		.$transaction(
			async (tx) => {
				await fn(tx);
				throw new Rollback();
			},
			{ timeout: 120_000, maxWait: 20_000 }
		)
		.catch((e) => {
			if (!(e instanceof Rollback)) throw e;
		});
}
const venue = (tx: Tx, id: string) => tx.venue.create({ data: { id: `zz-price-${id}`, name: `ZZ Price ${id}`, zoneName: 'KABALAGALA–MUYENGA' } });

test('the backfill: one row per non-null old column, and the floor is what the old columns showed — or the advance', () =>
	rolledBack(async (tx) => {
		// Nights shaped like the old data, then the backfill exactly as it ships.
		const v = await venue(tx, 'backfill');
		const date = addDays(today, 3);
		await tx.residency.create({ data: { id: 'zz-price-free', venueId: v.id, eventName: 'Free', category: 'DJ', dayOfWeek: 5, register: 'SOCIAL', priceGate: 0 } });
		await tx.residency.create({ data: { id: 'zz-price-none', venueId: v.id, eventName: 'Unpriced', category: 'DJ', dayOfWeek: 4, register: 'SOCIAL' } });
		await tx.occurrence.create({ data: { id: 'zz-price-adv', venueId: v.id, date: new Date(`${date}T00:00:00Z`), eventName: 'Brunch', category: 'BRUNCH', priceGate: 190_000, priceAdvance: 165_000 } });
		for (const statement of readFileSync('scripts/price-backfill.sql', 'utf8').replace(/--.*$/gm, '').split(';').map((s) => s.trim()).filter(Boolean))
			await tx.$executeRawUnsafe(statement);

		// Every night in the register: exactly one row per non-null column…
		const [res, occ] = await Promise.all([
			tx.residency.findMany({ select: { id: true, priceGate: true, priceAdvance: true, prices: true } }),
			tx.occurrence.findMany({ select: { id: true, date: true, priceGate: true, priceAdvance: true, prices: true } })
		]);
		let advanceNights = 0;
		for (const n of [...res, ...occ]) {
			const backfilled = n.prices.filter((p) => p.id.startsWith('pg-') || p.id.startsWith('pa-'));
			assert.equal(backfilled.length, Number(n.priceGate != null) + Number(n.priceAdvance != null), n.id);
			// …and the floor equals the published gate, except where an advance existed: there it is the advance.
			const shown = floor(backfilled.map(priceRow), today);
			if (n.priceAdvance != null) advanceNights++;
			assert.equal(shown, n.priceAdvance ?? n.priceGate, n.id);
		}
		assert.equal(advanceNights, 3); // the two in the register, and this test's brunch
		const none = res.find((n) => n.id === 'zz-price-none')!;
		assert.equal(none.prices.length, 0); // neither column: no rows, NOT ASKED YET
		assert.equal(priceLabel(res.find((n) => n.id === 'zz-price-free')!.prices.map(priceRow), today).entry, 'Free');
	}));

test('the week reads price rows: no rows is a missing cover, not free; an override with none keeps the rule’s', () =>
	rolledBack(async (tx) => {
		const v = await venue(tx, 'week');
		const week = nextMonday(today);
		const sat = addDays(week, 5);
		await tx.residency.create({ data: { id: 'zz-price-unpriced', venueId: v.id, eventName: 'Unpriced', category: 'DJ', dayOfWeek: 4, startTime: '21:00', register: 'SOCIAL', lastConfirmed: new Date() } });
		const r = await tx.residency.create({
			data: {
				id: 'zz-price-tiers', venueId: v.id, eventName: 'Tiers', category: 'DJ', dayOfWeek: 6, startTime: '21:00', register: 'SOCIAL', lastConfirmed: new Date(),
				prices: { create: [{ label: 'Ordinary', amount: 30_000, timing: 'GATE' }, { label: 'VIP', amount: 50_000 }, { label: 'VIP table', amount: 500_000, perTable: true, seats: 6 }] }
			}
		});
		await tx.occurrence.create({ data: { id: 'zz-price-tiers-override', venueId: v.id, residencyId: r.id, date: new Date(`${sat}T00:00:00Z`), eventName: 'Tiers', category: 'DJ', status: 'CONFIRMED', confirmedOn: new Date() } });
		const { rows } = await loadWeek(week, tx);
		const unpriced = rows.find((x) => x.residencyId === 'zz-price-unpriced')!;
		assert.deepEqual([unpriced.price.asked, unpriced.price.entry, unpriced.missing.includes('cover')], [false, null, true]);
		const tiers = rows.find((x) => x.residencyId === r.id)!;
		assert.equal(tiers.kind, 'OVERRIDE');
		assert.equal(tiers.price.entry, 'from 30K');
		assert.deepEqual(tiers.price.tables, ['VIP table 500K · seats 6']);
	}));

test('public_events and the week agree on offers for a date that has its own', () =>
	rolledBack(async (tx) => {
		const v = await venue(tx, 'offers');
		const date = addDays(today, 2);
		const dow = ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
		const r = await tx.residency.create({
			data: { id: 'zz-price-offers', venueId: v.id, eventName: 'Offers', category: 'DJ', dayOfWeek: dow, startTime: '21:00', register: 'SOCIAL', lastConfirmed: new Date(), perks: { create: [{ kind: 'DRINK', label: '5 beers at 25K' }] } }
		});
		await tx.occurrence.create({
			data: {
				id: 'zz-price-offers-date', venueId: v.id, residencyId: r.id, date: new Date(`${date}T00:00:00Z`), eventName: 'Offers', category: 'DJ', startTime: '21:00', register: 'SOCIAL',
				status: 'CONFIRMED', confirmedOn: new Date(), perks: { create: [{ kind: 'ENTRY', label: 'Free before 9' }, { kind: 'DRINK', label: '5 Beers at 25K' }] }
			}
		});
		const [view] = await tx.$queryRawUnsafe<{ perks: { label: string }[] }[]>(`SELECT perks FROM public_events WHERE id = 'zz-price-offers-date'`);
		const monday = addDays(date, -(dow - 1));
		const { rows } = await loadWeek(monday, tx);
		const row = rows.find((x) => x.key === 'zz-price-offers-date')!;
		assert.deepEqual(view.perks.map((p) => p.label), row.perks.map((p) => p.label));
		assert.deepEqual(row.perks.map((p) => p.label), ['5 beers at 25K', 'Free before 9']); // added, not replaced; the same offer once
	}));
