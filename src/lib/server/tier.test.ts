// node --test src/lib/server/tier.test.ts — no database needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeVenueTier, dueDateForNight, dueDateForVenue, monthsBefore, tierForNight, tierForVenue, type Night } from './tier.ts';

const today = '2026-11-08';
const standing = (lastConfirmed: string | null, runningSince: string | null = null, firstConfirmedAt: string | null = lastConfirmed): Night => ({
	kind: 'standing',
	lastConfirmed,
	runningSince,
	firstConfirmedAt
});
const oneOff = (date: string, confirmed: boolean): Night => ({ kind: 'one-off', date, confirmed });

test('tierForNight: never confirmed is C, whatever it claims', () => {
	assert.equal(tierForNight(standing(null), today), 'C');
	assert.equal(tierForNight(standing(null, '2020-01-01'), today), 'C'); // "running since 2020", never verified
	assert.equal(tierForNight(oneOff('2026-11-20', false), today), 'C');
});

test('tierForNight: a one-off confirmed, or already past, is DONE', () => {
	assert.equal(tierForNight(oneOff('2026-11-20', true), today), 'DONE');
	assert.equal(tierForNight(oneOff('2026-11-01', false), today), 'DONE');
});

test('tierForNight: confirmed, held under 3 months — or not known — is B', () => {
	assert.equal(tierForNight(standing('2026-11-01', null), today), 'B');
	assert.equal(tierForNight(standing('2026-11-01', '2026-09-01'), today), 'B');
	assert.equal(tierForNight(standing('2026-11-01', '2026-08-09'), today), 'B'); // a day short of 3 months
});

test('tierForNight: confirmed and held 3+ months is A', () => {
	assert.equal(tierForNight(standing('2026-11-01', '2026-08-08'), today), 'A'); // exactly 3 months
	assert.equal(tierForNight(standing('2026-10-01', '2024-03-01'), today), 'A');
});

test('three months back clamps to the month’s end', () => {
	assert.equal(monthsBefore('2026-05-31', 3), '2026-02-28');
	assert.equal(monthsBefore('2026-11-08', 3), '2026-08-08');
});

test('tierForVenue: C beats B beats A', () => {
	const A = standing('2026-11-01', '2025-01-01');
	const B = standing('2026-11-01', null);
	const C = standing(null);
	assert.equal(tierForVenue([A, B, C], today), 'C');
	assert.equal(tierForVenue([A, B], today), 'B');
	assert.equal(tierForVenue([A], today), 'A');
});

test('tierForVenue: no nights is not a tier — that is discovery', () => {
	assert.equal(tierForVenue([], today), null);
	assert.equal(tierForVenue([oneOff('2026-11-01', true)], today), null); // only finished one-offs
});

test('tierForVenue: Buffaloes Lounge — three nights, none ever confirmed — is C', () => {
	assert.equal(tierForVenue([standing(null), standing(null), standing(null)], today), 'C');
});

test('dueDateForNight: C is due now; B a week, A a month after the last confirmation; DONE never', () => {
	assert.equal(dueDateForNight(standing(null), today), today);
	assert.equal(dueDateForNight(standing('2026-11-01', null), today), '2026-11-08');
	assert.equal(dueDateForNight(standing('2026-10-20', '2025-01-01'), today), '2026-11-19');
	assert.equal(dueDateForNight(oneOff('2026-11-20', true), today), null);
});

test('a venue is due when its most urgent night is — not its earliest', () => {
	const A = standing('2026-09-01', '2025-01-01'); // due 1 Oct — long overdue, but A
	const B = standing('2026-11-05', null); //         due 12 Nov
	assert.equal(dueDateForVenue([A, B], today), '2026-11-12');
	assert.equal(dueDateForVenue([], today), null);
});

test('tierForNight: A on our own history — first confirmed 3+ months ago, running since never asked', () => {
	assert.equal(tierForNight(standing('2026-11-01', null, '2026-08-08'), today), 'A');
	assert.equal(tierForNight(standing('2026-11-01', null, '2026-08-09'), today), 'B'); // a day short
});

test('tierForNight: B when both the claim and our history are recent', () => {
	assert.equal(tierForNight(standing('2026-11-01', '2026-10-01', '2026-10-15'), today), 'B');
});

test('tierForNight: an old first confirmation never rescues a night with no confirmation on record', () => {
	assert.equal(tierForNight(standing(null, '2020-01-01', '2025-01-01'), today), 'C');
});

test('the call screen’s read-only reason', () => {
	const t = (ns: Night[]) => describeVenueTier(ns, today).text;
	assert.equal(t([standing('2026-11-02', null)]), 'Tier B · weekly — confirmed 2 Nov, running since not known');
	assert.equal(t([standing('2026-10-20', '2026-03-01')]), 'Tier A · monthly — confirmed 20 Oct, running since Mar 2026');
	assert.equal(t([standing('2026-10-20', null, '2026-07-01')]), 'Tier A · monthly — confirmed 20 Oct, running since not known · first confirmed 1 Jul 2026');
	assert.equal(t([standing(null)]), 'Tier C · this week — a night here has never been confirmed');
	assert.equal(t([]), 'No tier — no night on file to call about');
});

test('a rotating night is never A: held two years, it is still B — and C until confirmed', () => {
	const today = '2026-11-12';
	const held: Night = { kind: 'standing', lastConfirmed: '2026-11-05', runningSince: '2024-11-01', firstConfirmedAt: '2025-01-10' };
	assert.equal(tierForNight(held, today), 'A');
	assert.equal(tierForNight({ ...held, rotating: true }, today), 'B');
	assert.equal(tierForNight({ ...held, rotating: true, lastConfirmed: null }, today), 'C');
	// B comes due a week after each confirmation, so it is back on the round every week by itself.
	assert.equal(dueDateForNight({ ...held, rotating: true }, today), '2026-11-12');
	assert.equal(dueDateForNight(held, today), '2026-12-05');
	assert.match(describeVenueTier([{ ...held, rotating: true }], today).text, /Tier B · weekly — .*a different act every week/);
});

// ── staleness by tier ────────────────────────────────────────────────────
import { FRESH_DAYS, freshOn, registerHealth, type HealthNight } from './tier.ts';
import { addDays } from '../build/week.ts';
import { buildWeek, type ResidencyIn } from '../build/week.ts';

const asOf = '2026-11-30';
const bNight = (daysAgo: number): Night => ({ kind: 'standing', lastConfirmed: addDays(asOf, -daysAgo), runningSince: '2026-10-01', firstConfirmedAt: '2026-10-20' }); // held < 3 months: B
const aNight = (daysAgo: number): Night => ({ kind: 'standing', lastConfirmed: addDays(asOf, -daysAgo), runningSince: '2024-01-01', firstConfirmedAt: '2025-01-01' }); // held years: A

test('tier B holds 10 days: confirmed 12 days ago it is held out, at 8 it publishes', () => {
	assert.equal(FRESH_DAYS.B, 10);
	assert.equal(tierForNight(bNight(8), asOf), 'B');
	assert.equal(freshOn(bNight(8) as never, asOf), true);
	assert.equal(freshOn(bNight(12) as never, asOf), false);
	// …and a rotating night is B however long it has run.
	assert.equal(freshOn({ ...aNight(12), rotating: true } as never, asOf), false);
});

test('tier A holds 45 days: at 40 it still publishes, at 50 it does not', () => {
	assert.equal(freshOn(aNight(40) as never, asOf), true);
	assert.equal(freshOn(aNight(50) as never, asOf), false);
});

test('tier C has no window: never confirmed is never publishable — and a one-off’s confirmation doesn’t age', () => {
	assert.equal(freshOn({ kind: 'standing', lastConfirmed: null, runningSince: '2020-01-01' } as never, asOf), false);
	const venue = { id: 'v', name: 'V', zone: null, division: null, phone: null };
	const rows = buildWeek(asOf, [], [
		{ id: 'old', date: '2026-12-02', venue, residencyId: null, eventName: 'Old', category: 'DJ', startTime: '21:00', prices: [], register: 'SOCIAL', claimType: 'FACTUAL', source: 'OWNER', status: 'CONFIRMED', confirmedOn: '2026-06-01', attendedAt: null, attendedBy: null, clearsF2: null, lineup: [], perks: [] }
	]);
	assert.equal(rows[0].state, 'publishable');
});

test('the week applies the window: a B night confirmed 12 days before the week is a lead, at 8 it publishes', () => {
	const venue = { id: 'v', name: 'V', zone: null, division: null, phone: null };
	const night = (daysAgo: number): ResidencyIn => ({
		id: `n${daysAgo}`, venue, eventName: 'N', category: 'LIVE_BAND', dayOfWeek: 3, startTime: '21:00', prices: [], register: 'SOCIAL', recurrence: 'WEEKLY',
		claimType: 'FACTUAL', source: 'OWNER', lastConfirmed: addDays(asOf, -daysAgo), runningSince: '2026-10-01', firstConfirmedAt: '2026-10-20',
		attendedAt: null, attendedBy: null, clearsF2: null, lineup: [], perks: []
	});
	assert.deepEqual(buildWeek(asOf, [night(8), night(12)], []).map((r) => [r.key.split('|')[0], r.state]), [['n8', 'publishable'], ['n12', 'lead']]);
});

test('register health: the weekly need is derived from the book and moves when a night is added', () => {
	const n = (o: Partial<HealthNight>): HealthNight => ({ ...(bNight(3) as HealthNight), venue: 'V', eventName: 'N', startTime: '21:00', register: 'SOCIAL', ...o });
	const book = [n({}), n({ lastConfirmed: null }), n({ ...(aNight(20) as object) }), n({ lastConfirmed: addDays(asOf, -30), eventName: 'Stale' })];
	const h = registerHealth(book, asOf);
	// Each night's share of a week: 7/10 for B (and C, confirmed into B), 7/45 for A.
	assert.equal(h.needed, Math.ceil(3 * (7 / 10) + 7 / 45));
	assert.equal(registerHealth([...book, n({})], asOf).needed, Math.ceil(4 * (7 / 10) + 7 / 45));
	assert.deepEqual([h.total, h.publishable, h.never, h.last30], [4, 2, 1, 2]); // 30 days ago is outside the last 30
	assert.equal(h.oldestLapsed?.eventName, 'Stale');
	assert.equal(h.thisWeek, 0); // Monday 30 Nov: nothing confirmed today
	assert.equal(h.red, false); //   2 of 4 is half — red is under half
	assert.equal(registerHealth([...book, n({ lastConfirmed: null })], asOf).red, true);
});
