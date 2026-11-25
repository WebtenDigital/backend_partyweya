// npm run test:db — rotating acts against the real database: the call
// screen's save, the cadence, and the TRANSFERRED trigger. Every test builds
// its own rows inside a transaction and rolls it back.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createPrisma, type Tx } from '../src/lib/server/db.ts';
import { addDays, nextMonday } from '../src/lib/build/week.ts';
import { loadOwed } from '../src/lib/server/queue.ts';
import { use, reset, disconnect } from './support/prisma.ts';
import { actions } from '../src/routes/(app)/calls/[venueId]/+page.server.ts';

const db = createPrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL!);
after(async () => {
	await db.$disconnect();
	await disconnect();
});

// A frozen Thursday, as the queue test: the cadence is tested against a known calendar.
const today = '2026-11-12';
const week = nextMonday(today);
const at = (d: string) => new Date(`${d}T12:00:00+03:00`);
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

const setup = async (tx: Tx, id: string, data: Record<string, unknown> = {}) => {
	const v = await tx.venue.create({ data: { id: `zz-rot-${id}`, name: `ZZ Rot ${id}`, zoneName: 'KABALAGALA–MUYENGA', phones: ['0772 000001'], conversationTest: 'NO' } });
	const r = await tx.residency.create({
		data: { id: `zz-rot-${id}-thu`, venueId: v.id, eventName: 'Classic Thursdays', category: 'LIVE_BAND', dayOfWeek: 4, startTime: '21:00', register: 'HIGH_ENERGY', ...data }
	});
	return { v, r };
};
const transferring = (tx: Tx, name: string) =>
	tx.act.create({ data: { id: `zz-rot-${name.toLowerCase().replace(/\W+/g, '-')}`, name, transfers: true, transfersNote: 'test: a record we would vouch for' } });

/** A reached call on the standing night, as the screen posts it. */
function call(residencyId: string, fields: Record<string, string>, lists: Record<string, string[]> = {}) {
	const f = new FormData();
	for (const [k, v] of Object.entries({ outcome: 'reached', dial: 'venue', source: 'OWNER', week, mode: 'standing', residencyId, s_start: '', s_end: '', s_since: '', s_category: '', ...fields })) f.set(k, v);
	for (const [k, names] of Object.entries(lists)) {
		f.set(`${k}_sent`, '1');
		for (const n of names) f.append(k, n);
	}
	return f;
}
const save = (venueId: string, f: FormData) =>
	(actions.save as any)({ params: { venueId }, request: new Request('http://x/', { method: 'POST', body: f }) }).then(
		(r: any) => assert.fail(`the call didn’t save: ${r?.data?.error}`),
		(e: any) => {
			if (e?.status !== 303) throw e;
		}
	);

test('a rotating night held two years is on the call round every week; the same night not rotating is monthly', () =>
	rolledBack(async (tx) => {
		const held = { lastConfirmed: at(addDays(today, -8)), runningSince: at('2024-11-01'), firstConfirmedAt: at('2025-01-10') };
		const rot = await setup(tx, 'cadence', { ...held, rotatingAct: true });
		const fixed = await setup(tx, 'cadence-fixed', held);
		const { queue } = await loadOwed(week, today, tx);
		// B holds 10 days, so by the build week it has lapsed: "before publishing", the most urgent group.
		assert.deepEqual(queue.filter((q) => q.venue.id === rot.v.id).map((q) => q.group), ['this-week']);
		assert.deepEqual(queue.filter((q) => q.venue.id === fixed.v.id).map((q) => q.group), []); // tier A: not for weeks
		// And the week after, confirmed by that call, again.
		const next = addDays(today, 7);
		await tx.residency.update({ where: { id: rot.r.id }, data: { lastConfirmed: at(addDays(next, -7)) } });
		const again = await loadOwed(nextMonday(next), next, tx);
		assert.deepEqual(again.queue.filter((q) => q.venue.id === rot.v.id).map((q) => q.group), ['this-week']);
	}));

test('"different act every week" keeps the resident act; this week’s act goes on the date, never the rule', () =>
	rolledBack(async (tx) => {
		const { v, r } = await setup(tx, 'guest', { lineup: ['Sam Mugagga and the Genius Pals Band'] });
		await save(v.id, call(r.id, { s_rotating: '1' }, { s_guest: ['Mr Henrie'] }));
		const rule = await tx.residency.findUniqueOrThrow({ where: { id: r.id } });
		assert.equal(rule.rotatingAct, true);
		assert.deepEqual(rule.lineup, ['Sam Mugagga and the Genius Pals Band']); // untouched by the weekly answer
		const date = addDays(week, 3);
		const o = await tx.occurrence.findFirstOrThrow({ where: { residencyId: r.id } });
		assert.equal(o.date.toISOString().slice(0, 10), date);
		assert.deepEqual(o.lineup, ['Mr Henrie', 'Sam Mugagga and the Genius Pals Band']); // the guest headlines that date
	}));

test('TRANSFERRED on a rotating night: the standing row never carries it', () =>
	rolledBack(async (tx) => {
		const act = await transferring(tx, 'ZZ Rot Headliner');
		const { v, r } = await setup(tx, 'claim', { rotatingAct: true, lineup: [act.name], claimType: 'FACTUAL', source: 'OWNER' });
		// The standing row of a rotating night never transfers, whoever its resident is.
		await assert.rejects(tx.residency.update({ where: { id: r.id }, data: { claimType: 'TRANSFERRED' } }), /transferred_rotating_needs_dated_lineup/);
	}));

// (A refused write aborts its transaction, so each refusal gets a test of its own.)
test('…and a date of it with no lineup of its own is refused too — not judged on the rule’s resident', () =>
	rolledBack(async (tx) => {
		const act = await transferring(tx, 'ZZ Rot Headliner');
		const { v, r } = await setup(tx, 'claim-date', { rotatingAct: true, lineup: [act.name], claimType: 'FACTUAL', source: 'OWNER' });
		const date = new Date(`${addDays(week, 3)}T00:00:00Z`);
		const base = { venueId: v.id, residencyId: r.id, date, eventName: r.eventName, category: r.category, source: 'OWNER' as const, claimType: 'TRANSFERRED' as const };
		// A date with no lineup of its own is "a new celebrity every week": refused, not inherited from the rule.
		await assert.rejects(tx.occurrence.create({ data: { ...base, id: "zz-rot-claim-empty" } }), /transferred_rotating_needs_dated_lineup/);
	}));

test('…and the same date with the act named carries it', () =>
	rolledBack(async (tx) => {
		const act = await transferring(tx, 'ZZ Rot Named');
		const { v, r } = await setup(tx, 'claim-ok', { rotatingAct: true });
		const o = await tx.occurrence.create({
			data: { id: 'zz-rot-claim-named', venueId: v.id, residencyId: r.id, date: new Date(`${addDays(week, 3)}T00:00:00Z`), eventName: r.eventName, category: r.category, source: 'OWNER', claimType: 'TRANSFERRED', lineup: [act.name] }
		});
		assert.equal(o.claimType, 'TRANSFERRED');
	}));

test('turning a transferred night rotating is refused until its claim is let go', () =>
	rolledBack(async (tx) => {
		const act = await transferring(tx, 'ZZ Rot Resident');
		const { r } = await setup(tx, 'flip', { lineup: [act.name], claimType: 'TRANSFERRED', source: 'OWNER' });
		await assert.rejects(tx.residency.update({ where: { id: r.id }, data: { rotatingAct: true } }), /transferred_rotating_needs_dated_lineup/);
	}));

test('through the call screen: a rotating night with a transferring resident claims FACTUAL on the rule, TRANSFERRED on a named date', () =>
	rolledBack(async (tx) => {
		const act = await transferring(tx, 'ZZ Rot Guest Star');
		const { v, r } = await setup(tx, 'derived');
		await save(v.id, call(r.id, { s_rotating: '1' }, { s_guest: [act.name] }));
		assert.equal((await tx.residency.findUniqueOrThrow({ where: { id: r.id } })).claimType, 'FACTUAL');
		assert.equal((await tx.occurrence.findFirstOrThrow({ where: { residencyId: r.id } })).claimType, 'TRANSFERRED');
	}));
