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
