// npm run test:db — fortnightly and monthly residencies against the real
// register: the migration changed nothing for existing nights, and /add won't
// save a rule it can't place. Writes roll back.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createPrisma, type Tx } from '../src/lib/server/db.ts';
import { addDays, kampalaToday, nextMonday } from '../src/lib/build/week.ts';
import { loadWeek } from '../src/lib/server/register.ts';
import { use, reset, disconnect } from './support/prisma.ts';
import { actions } from '../src/routes/(app)/add/+page.server.ts';

const db = createPrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL!);
after(async () => {
	await db.$disconnect();
	await disconnect();
});
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
			{ timeout: 120_000, maxWait: 30_000 }
		)
		.catch((e) => {
			if (!(e instanceof Rollback)) throw e;
		});
}

test('after the migration every existing residency is WEEKLY and expands exactly as before', async () => {
	const all = await db.residency.findMany({ select: { id: true, recurrence: true, anchorDate: true, monthlyOrdinal: true, active: true } });
	assert.ok(all.length > 0);
	for (const r of all) assert.deepEqual([r.recurrence, r.anchorDate, r.monthlyOrdinal], ['WEEKLY', null, null], r.id);
	const week = nextMonday(kampalaToday());
	const { rows } = await loadWeek(week, db);
	const cancelled = new Set(
		(await db.occurrence.findMany({ where: { status: 'CANCELLED', residencyId: { not: null }, date: { gte: new Date(`${week}T00:00:00Z`), lte: new Date(`${addDays(week, 6)}T00:00:00Z`) } }, select: { residencyId: true } })).map((o) => o.residencyId)
	);
	for (const r of all.filter((r) => r.active)) assert.equal(rows.filter((x) => x.residencyId === r.id).length, cancelled.has(r.id) ? 0 : 1, r.id);
	assert.equal(rows.filter((r) => r.state === 'held').length, 0); // nothing held: nothing changed
});

const form = (o: Record<string, string>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries({ provenance: 'venue', new_name: 'ZZ Rec Venue', eventName: 'ZZ Every Other', category: 'LIVE_BAND', day: '6', register: 'SOCIAL', start: '21:00', ...o })) f.set(k, v);
	return f;
};
const add = (f: FormData) =>
	(actions.save as any)({ request: new Request('http://x/', { method: 'POST', body: f }), url: new URL('http://x/add') }).then(
		(r: any) => r,
		(e: any) => {
			if (e?.status === 303) return { saved: true };
			throw e;
		}
	);

test('/add won’t save a fortnightly night without a date it ran, or a monthly one without which of the month', () =>
	rolledBack(async (tx) => {
		// (Each its own venue: in a test's transaction a refused save's new venue isn't rolled back.)
		assert.match((await add(form({ repeat: 'fortnightly', new_name: 'ZZ Rec A' }))).data.error, /from when/);
		assert.match((await add(form({ repeat: 'fortnightly', anchorDate: '2026-11-20', new_name: 'ZZ Rec B' }))).data.error, /Friday/); // not a Saturday
		assert.match((await add(form({ repeat: 'monthly', new_name: 'ZZ Rec C' }))).data.error, /Which one of the month/);
		assert.equal(await tx.residency.count({ where: { eventName: 'ZZ Every Other' } }), 0);
	}));

test('/add saves a fortnightly night with its anchor, and a monthly one with its pattern', () =>
	rolledBack(async (tx) => {
		assert.deepEqual(await add(form({ repeat: 'fortnightly', anchorDate: '2026-11-21' })), { saved: true });
		const f = await tx.residency.findFirstOrThrow({ where: { eventName: 'ZZ Every Other' } });
		assert.deepEqual([f.recurrence, f.anchorDate?.toISOString().slice(0, 10), f.monthlyOrdinal], ['FORTNIGHTLY', '2026-11-21', null]);
		assert.deepEqual(await add(form({ repeat: 'monthly', monthlyOrdinal: 'LAST', eventName: 'ZZ Last Saturday', new_name: 'ZZ Rec Venue 2' })), { saved: true });
		const m = await tx.residency.findFirstOrThrow({ where: { eventName: 'ZZ Last Saturday' } });
		assert.deepEqual([m.recurrence, m.anchorDate, m.monthlyOrdinal], ['MONTHLY', null, 'LAST']);
	}));
