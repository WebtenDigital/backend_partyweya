// npm run test:db — the category pages against the real register. Reads the
// live data; anything written is inside a transaction that rolls back.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createPrisma, type Tx } from '../src/lib/server/db.ts';
import { kampalaToday, nextMonday } from '../src/lib/build/week.ts';
import { CATEGORIES, listing } from '../src/lib/build/categories.ts';
import { loadWeek } from '../src/lib/server/register.ts';
import { standingCounts, unclassifiedNights } from '../src/lib/server/categories.ts';

const db = createPrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL!);
after(() => db.$disconnect());
const week = nextMonday(kampalaToday());
class Rollback extends Error {}
async function rolledBack(fn: (tx: Tx) => Promise<void>) {
	await db
		.$transaction(
			async (tx) => {
				await fn(tx);
				throw new Rollback();
			},
			{ timeout: 120_000, maxWait: 30_000 }
		)
		.catch((e) => {
			if (!(e instanceof Rollback)) throw e;
		});
}
const onPage = (l: ReturnType<typeof listing>, residencyId: string) =>
	l.days.some((d) => [...d.entries, ...d.held.map((h) => h.row)].some((r) => r.residencyId === residencyId));

test('Anex’s Comedy & Live Band Saturdays is on the live band page, and not on comedy', async () => {
	const { rows } = await loadWeek(week, db);
	const anex = 'anexlounge-comedy-live-band-saturdays';
	assert.ok(onPage(listing(rows, 'LIVE_BAND', week, 'week'), anex));
	assert.ok(!onPage(listing(rows, 'COMEDY', week, 'week'), anex));
	// …and every row in the register lands on exactly one category page.
	for (const r of rows) assert.equal(CATEGORIES.filter((c) => listing(rows, c, week, 'week').days.some((d) => [...d.entries, ...d.held.map((h) => h.row)].includes(r))).length, 1, r.key);
});

test('the confidence line: 0 of N everywhere until a category is asked, and it rises as they are', () =>
	rolledBack(async (tx) => {
		await tx.residency.updateMany({ where: { active: true }, data: { categoryAskedAt: null } });
		const none = await standingCounts(tx);
		for (const c of CATEGORIES) assert.equal(none.asked[c], 0, c);
		assert.ok(none.total.LIVE_BAND > 0);
		const band = await tx.residency.findFirstOrThrow({ where: { active: true, category: 'LIVE_BAND' } });
		await tx.residency.update({ where: { id: band.id }, data: { categoryAskedAt: new Date() } });
		const one = await standingCounts(tx);
		assert.equal(one.asked.LIVE_BAND, 1);
		assert.equal(one.total.LIVE_BAND, none.total.LIVE_BAND);
	}));

test('the unclassified worklist lists every THEMED_NIGHT standing night, by venue', async () => {
	const themed = await db.residency.findMany({ where: { active: true, category: 'THEMED_NIGHT' }, select: { id: true } });
	const list = await unclassifiedNights(db);
	for (const t of themed) assert.ok(list.some((n) => n.id === t.id), t.id);
	assert.equal(list.filter((n) => n.category === 'THEMED_NIGHT').length, themed.length);
	assert.deepEqual(list.map((n) => n.venue), [...list.map((n) => n.venue)].sort((a, b) => a.localeCompare(b)));
	console.log(`# THEMED_NIGHT on the worklist: ${themed.length}`);
});
