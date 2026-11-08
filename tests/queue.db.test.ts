// npm run test:db — the call round's three sources, against the real database.
// Every test builds its own venues inside a transaction and rolls it back, so
// the register is never touched.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createPrisma, type Tx } from '../src/lib/server/db.ts';
import { loadDiscovery, loadOwed } from '../src/lib/server/queue.ts';
import { kampalaToday, nextMonday } from '../src/lib/build/week.ts';

const db = createPrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL!);
after(() => db.$disconnect());

const today = kampalaToday();
const week = nextMonday(today); // every night in it is still ahead
class Rollback extends Error {}

async function rolledBack(fn: (tx: Tx) => Promise<void>) {
	await db
		.$transaction(async (tx) => {
			await fn(tx);
			throw new Rollback();
		}, { timeout: 120_000, maxWait: 20_000 })
		.catch((e) => {
			if (!(e instanceof Rollback)) throw e;
		});
}

const venue = (tx: Tx, id: string, data: Record<string, unknown> = {}) =>
	tx.venue.create({ data: { id: `zz-test-${id}`, name: `ZZ Test ${id}`, phones: ['0772 000001'], ...data } });

const night = (tx: Tx, venueId: string, data: Record<string, unknown> = {}) =>
	tx.residency.create({
		data: { id: `${venueId}-night`, venueId, eventName: 'ZZ Test Night', category: 'DJ', dayOfWeek: 5, startTime: '21:00', register: 'SOCIAL', ...data }
	});

/** Where one venue lands: the call round's groups, discovery (past the cap too), unreachable. */
const groupsOf = async (tx: Tx, id: string) => {
	const [{ queue }, discovery] = await Promise.all([loadOwed(week, today, tx), loadDiscovery(today, tx)]);
	return {
		queue: queue.filter((r) => r.venue.id === id).map((r) => r.group),
		discovery: discovery.ready.has(id),
		unreachable: discovery.unreachable.some((v) => v.id === id)
	};
};

test('group 2: an unconfirmed standing night inside the window is before publishing', () =>
	rolledBack(async (tx) => {
		const v = await venue(tx, 'g2');
		await night(tx, v.id, { lastConfirmed: null });
		const g = await groupsOf(tx, v.id);
		assert.deepEqual(g.queue, ['this-week']);
		assert.equal(g.discovery, false);
	}));

test('group 2: the same night, confirmed this week, is not', () =>
	rolledBack(async (tx) => {
		const v = await venue(tx, 'g2-ok', { conversationTest: 'CAN_TALK' }); // classed, so not "unclassified" either
		await night(tx, v.id, { lastConfirmed: new Date() });
		assert.deepEqual((await groupsOf(tx, v.id)).queue, []);
	}));

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

test('group 1: a tier B venue a week past its last confirmation is cadence — whatever the stored columns say', () =>
	rolledBack(async (tx) => {
		// Venue.tier / nextContactDue are not read: these values would say "A, not due".
		const v = await venue(tx, 'g1', { conversationTest: 'CAN_TALK', tier: 'A', nextContactDue: new Date(Date.now() + 30 * 86_400_000) });
		await night(tx, v.id, { lastConfirmed: daysAgo(8), runningSince: daysAgo(30) });
		assert.deepEqual((await groupsOf(tx, v.id)).queue, ['due']);
	}));

test('group 1: tier A — confirmed and held 3+ months — a month past its last confirmation is cadence', () =>
	rolledBack(async (tx) => {
		const v = await venue(tx, 'tier-a', { conversationTest: 'CAN_TALK' });
		await night(tx, v.id, { lastConfirmed: daysAgo(31), runningSince: daysAgo(400) });
		assert.deepEqual((await groupsOf(tx, v.id)).queue, ['due']);
	}));

test('group 2: any standing night never confirmed is before publishing — weekly or monthly, never cadence', () =>
	rolledBack(async (tx) => {
		const weekly = await venue(tx, 'never-weekly', { conversationTest: 'CAN_TALK' });
		await night(tx, weekly.id, { lastConfirmed: null, runningSince: daysAgo(900) });
		// Monthly isn't placed in the week, but an unconfirmed standing night blocks every window.
		const monthly = await venue(tx, 'never-monthly', { conversationTest: 'CAN_TALK' });
		await night(tx, monthly.id, { lastConfirmed: null, recurrence: 'MONTHLY', runningSince: daysAgo(900) });
		assert.deepEqual((await groupsOf(tx, weekly.id)).queue, ['this-week']);
		assert.deepEqual((await groupsOf(tx, monthly.id)).queue, ['this-week']);
	}));

test('group 3: a venue with no nights and a number is discovery — and only discovery, even if due', () =>
	rolledBack(async (tx) => {
		// Stored tier / nextContactDue are not read: a venue with no nights has no tier.
		const v = await venue(tx, 'g3', { nextContactDue: new Date(), tier: 'C' });
		const g = await groupsOf(tx, v.id);
		assert.equal(g.discovery, true);
		assert.deepEqual(g.queue, []);
		assert.equal(g.unreachable, false);
	}));

test('group 3 is not cleared by answering: reached, no night recorded, still discovery', () =>
	rolledBack(async (tx) => {
		const v = await venue(tx, 'g3-answered', { lastContacted: new Date(), conversationTest: 'CAN_TALK' });
		assert.equal((await groupsOf(tx, v.id)).discovery, true);
	}));

test('a venue that runs nothing appears in neither discovery nor unreachable', () =>
	rolledBack(async (tx) => {
		const v = await venue(tx, 'none', { noProgramme: true, noProgrammeAt: new Date(), lastContacted: new Date() });
		const g = await groupsOf(tx, v.id);
		assert.deepEqual(g, { queue: [], discovery: false, unreachable: false });
	}));

test('four no-answers: unreachable only', () =>
	rolledBack(async (tx) => {
		const v = await venue(tx, 'unreachable', { contactAttempts: 4 });
		const g = await groupsOf(tx, v.id);
		assert.deepEqual(g, { queue: [], discovery: false, unreachable: true });
	}));

test('a no-answer today rolls to the next working day; one from a week ago is back', () =>
	rolledBack(async (tx) => {
		const today_ = await venue(tx, 'tried-today', { contactAttempts: 1, lastAttemptAt: new Date() });
		const lastWeek = await venue(tx, 'tried-last-week', { contactAttempts: 1, lastAttemptAt: daysAgo(7) });
		assert.equal((await groupsOf(tx, today_.id)).discovery, false);
		assert.equal((await groupsOf(tx, lastWeek.id)).discovery, true);
	}));

test('no night and no number: not a call queue — counted in "need a number", linked to /venues', () =>
	rolledBack(async (tx) => {
		const before = (await loadDiscovery(today, tx)).needNumber;
		const v = await venue(tx, 'no-number', { phones: [] });
		assert.deepEqual(await groupsOf(tx, v.id), { queue: [], discovery: false, unreachable: false });
		assert.equal((await loadDiscovery(today, tx)).needNumber, before + 1);
	}));

test('a call can never produce a vetted claim: the database refuses it', () =>
	rolledBack(async (tx) => {
		const v = await venue(tx, 'vetted');
		await assert.rejects(night(tx, v.id, { source: 'MANAGER', claimType: 'VETTED' }), /residency_vetted_means_attended/);
	}));

test('firstConfirmedAt is set by the first confirmation and never overwritten by a later one', () =>
	rolledBack(async (tx) => {
		const v = await venue(tx, 'first-confirmed');
		const r = await night(tx, v.id, { lastConfirmed: null });
		assert.equal(r.firstConfirmedAt, null);
		const first = daysAgo(100);
		const once = await tx.residency.update({ where: { id: r.id }, data: { lastConfirmed: first } });
		assert.equal(+once.firstConfirmedAt!, +first);
		const twice = await tx.residency.update({ where: { id: r.id }, data: { lastConfirmed: new Date() } });
		assert.equal(+twice.firstConfirmedAt!, +first); // the second confirmation moved lastConfirmed only
		// Not even a direct write can move it once set.
		const forced = await tx.residency.update({ where: { id: r.id }, data: { firstConfirmedAt: new Date() } });
		assert.equal(+forced.firstConfirmedAt!, +first);
		// …and 100 days of our own confirmations make it tier A with running-since never asked.
		assert.deepEqual((await groupsOf(tx, v.id)).queue.filter((g) => g !== 'unclassified'), []);
	}));

test('the backfill: every confirmed residency has firstConfirmedAt equal to its lastConfirmed', () =>
	rolledBack(async (tx) => {
		const rows = await tx.residency.findMany({ where: { lastConfirmed: { not: null } }, select: { id: true, lastConfirmed: true, firstConfirmedAt: true } });
		assert.ok(rows.length > 0);
		// Every row confirmed only once so far (no second call since the migration) is equal;
		// none is missing it, and none starts its clock after its own last confirmation.
		for (const r of rows) {
			assert.ok(r.firstConfirmedAt, r.id);
			assert.ok(+r.firstConfirmedAt! <= +r.lastConfirmed!, r.id);
		}
		assert.equal(rows.filter((r) => +r.firstConfirmedAt! === +r.lastConfirmed!).length, rows.length);
	}));
