// npm run test:db — "write up a night out", against the real database. Every
// test builds its own venue inside a transaction and rolls it back.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createPrisma, type Tx } from '../src/lib/server/db.ts';
import { addNightOut } from '../src/lib/server/nights.ts';
import { recordVisit } from '../src/lib/server/visit.ts';
import { addDays, kampalaToday } from '../src/lib/build/week.ts';
import { isoDay } from '../src/lib/build/add.ts';
import { use, reset, disconnect } from './support/prisma.ts';
import { load as visitsLoad } from '../src/routes/(app)/visits/+page.server.ts';

const db = createPrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL!);
after(async () => {
	await db.$disconnect();
	await disconnect();
});

const today = kampalaToday();
class Rollback extends Error {}
async function rolledBack(fn: (tx: Tx) => Promise<void>) {
	await db
		.$transaction(
			async (tx) => {
				use(tx);
				try {
					await fn(tx);
				} finally {
					reset();
				}
				throw new Rollback();
			},
			{ timeout: 120_000, maxWait: 20_000 }
		)
		.catch((e) => {
			if (!(e instanceof Rollback)) throw e;
		});
}

const block = (o: Record<string, string>) => {
	const f = new FormData();
	const fields = { name: '', category: '', recurrence: 'WEEKLY', day: '', date: '', start: '', end: '', gate: '', advance: '', since: '', lineup: '', register: '', ...o };
	for (const [k, v] of Object.entries(fields)) f.append(`n_${k}`, v);
	return f;
};
const nightless = (tx: Tx, id: string, data: Record<string, unknown> = {}) =>
	tx.venue.create({ data: { id: `zz-out-${id}`, name: `ZZ Out ${id}`, zoneName: 'KABALAGALA–MUYENGA', ...data } });

test('a weekly night out at a nightless venue creates exactly one Residency, then opens its write-up', () =>
	rolledBack(async (tx) => {
		const v = await nightless(tx, 'weekly');
		const visits = await tx.visit.count();
		const dow = isoDay(addDays(today, -1));
		const link = await addNightOut(tx, v.id, block({ name: 'Live Band Fridays', category: 'LIVE_BAND', day: String(dow), start: '21:00', register: 'HIGH_ENERGY' }), today);
		const res = await tx.residency.findMany({ where: { venueId: v.id } });
		assert.equal(res.length, 1);
		assert.equal(await tx.occurrence.count({ where: { venueId: v.id } }), 0);
		assert.equal(res[0].source, null); //       unconfirmed and claim-less until the write-up…
		assert.equal(res[0].claimType, null);
		assert.equal(res[0].lastConfirmed, null);
		assert.equal(link, `/attend/${res[0].id}?date=${addDays(today, -1)}`);
		// …which then makes it attended.
		await recordVisit(tx, {
			ref: res[0].id, date: addDays(today, -1), arrivedAt: null, leftAt: null, clears: true, register: 'HIGH_ENERGY', nothingDiffered: true,
			actualStartTime: null, actualPrice: null, actualLineup: [], correct: { start: false, price: false, lineup: false },
			vettedNote: null, leads: [], costEntry: null, costTransport: null, costSpend: null, initials: 'YSM', today
		});
		const after = await tx.residency.findUniqueOrThrow({ where: { id: res[0].id } });
		assert.equal(after.claimType, 'VETTED');
		assert.equal(after.source, 'ATTENDED');
		assert.equal(await tx.visit.count(), visits); // no Visit row anywhere on this path
	}));

test('a one-off night out creates exactly one Occurrence, a lead, on the date it happened', () =>
	rolledBack(async (tx) => {
		const v = await nightless(tx, 'one-off');
		const date = addDays(today, -2);
		const link = await addNightOut(tx, v.id, block({ name: 'Launch Party', category: 'DJ', recurrence: 'ONE_OFF', date, start: '22:00', register: 'HIGH_ENERGY' }), today);
		const occ = await tx.occurrence.findMany({ where: { venueId: v.id } });
		assert.equal(occ.length, 1);
		assert.equal(await tx.residency.count({ where: { venueId: v.id } }), 0);
		assert.equal(occ[0].status, 'LEAD');
		assert.equal(link, `/attend/${occ[0].id}?date=${date}`);
	}));

test('a night out older than the fortnight, or ahead, is refused for a one-off', () =>
	rolledBack(async (tx) => {
		const v = await nightless(tx, 'old');
		const one = (date: string) => block({ name: 'X', category: 'DJ', recurrence: 'ONE_OFF', date, start: '22:00', register: 'SOCIAL' });
		await assert.rejects(addNightOut(tx, v.id, one(addDays(today, -14)), today), /last fortnight/);
		await assert.rejects(addNightOut(tx, v.id, one(addDays(today, 1)), today), /last fortnight/);
	}));

test('a register must be given — there is no question 6 to fall back on', () =>
	rolledBack(async (tx) => {
		const v = await nightless(tx, 'no-register');
		await assert.rejects(addNightOut(tx, v.id, block({ name: 'X', category: 'DJ', day: '5', start: '21:00' }), today), /register/);
	}));

test('being there clears "runs nothing"', () =>
	rolledBack(async (tx) => {
		const v = await nightless(tx, 'flagged', { noProgramme: true, noProgrammeAt: new Date() });
		await addNightOut(tx, v.id, block({ name: 'Quiz', category: 'QUIZ', day: '3', start: '20:00', register: 'SOCIAL' }), today);
		const after = await tx.venue.findUniqueOrThrow({ where: { id: v.id } });
		assert.equal(after.noProgramme, false);
		assert.equal(after.noProgrammeAt, null);
	}));

test('the picker’s index: nights only from the last fortnight; nightless venues kept, runs-nothing flagged', () =>
	rolledBack(async (tx) => {
		const flagged = await nightless(tx, 'index-flagged', { noProgramme: true });
		const d: any = await (visitsLoad as any)({});
		const since = addDays(today, -13);
		assert.ok(d.nights.every((n: any) => n.dates.every((x: string) => x >= since && x <= today)));
		const entry = d.venues.find((v: any) => v.venueId === flagged.id);
		assert.equal(entry.noProgramme, true); // in the index, hidden by search until its exact name
	}));
