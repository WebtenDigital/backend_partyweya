// node --test src/lib/build/recurrence.test.ts — no database needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ordinalsOf, placeOn } from './recurrence.ts';
import { buildWeek, type ResidencyIn } from './week.ts';
import { listing } from './categories.ts';
import { freshOn, registerHealth, type HealthNight } from '../tier.ts';
import { addDays } from './week.ts';

const venue = { id: 'v', name: 'V', zone: null, division: null, phone: null };
const night = (o: Partial<ResidencyIn>): ResidencyIn => ({
	id: 'n', venue, eventName: 'N', category: 'LIVE_BAND', dayOfWeek: 6, startTime: '21:00', prices: [], register: 'SOCIAL', recurrence: 'WEEKLY',
	claimType: 'FACTUAL', source: 'OWNER', lastConfirmed: null, attendedAt: null, attendedBy: null, clearsF2: null, lineup: [], perks: [], ...o
});
const runs = (r: ResidencyIn, week: string) => buildWeek(week, [r], []).length === 1;

test('fortnightly, anchored 21 Nov (a Saturday): on the week of 5 Dec, off the week of 28 Nov', () => {
	const r = night({ recurrence: 'FORTNIGHTLY', anchorDate: '2026-11-21' });
	assert.equal(runs(r, '2026-11-30'), true); //  Sat 5 Dec
	assert.equal(runs(r, '2026-11-23'), false); // Sat 28 Nov
	assert.equal(runs(r, '2026-11-16'), true); //  the anchor's own week
	assert.equal(runs(r, '2026-11-09'), false); // and backwards too
});

test('moving the anchor one week flips every week it appears in', () => {
	const a = night({ recurrence: 'FORTNIGHTLY', anchorDate: '2026-11-21' });
	const b = night({ recurrence: 'FORTNIGHTLY', anchorDate: '2026-11-28' });
	for (let w = 0; w < 10; w++) {
		const week = addDays('2026-11-02', 7 * w);
		assert.notEqual(runs(a, week), runs(b, week), week);
	}
});

test('monthly: LAST and FOURTH Friday — the same in a four-Friday month, different in a five-Friday one', () => {
	// December 2026 has four Fridays (4, 11, 18, 25): the 25th is both the fourth and the last.
	assert.deepEqual(ordinalsOf('2026-12-25'), ['FOURTH', 'LAST']);
	const last = night({ recurrence: 'MONTHLY', monthlyOrdinal: 'LAST', dayOfWeek: 5 });
	const fourth = night({ recurrence: 'MONTHLY', monthlyOrdinal: 'FOURTH', dayOfWeek: 5 });
	assert.equal(buildWeek('2026-12-21', [last], [])[0]?.date, '2026-12-25');
	assert.equal(buildWeek('2026-12-21', [fourth], [])[0]?.date, '2026-12-25');
	// July 2026 has five (3, 10, 17, 24, 31): FOURTH is the 24th, LAST the 31st.
	assert.equal(buildWeek('2026-07-20', [fourth], [])[0]?.date, '2026-07-24');
	assert.equal(runs(last, '2026-07-20'), false);
	assert.equal(buildWeek('2026-07-27', [last], [])[0]?.date, '2026-07-31');
	assert.equal(runs(fourth, '2026-07-27'), false);
});

test('a rule that can’t be placed is held out with its reason — never listed, never dropped', () => {
	for (const [r, reason] of [
		[night({ recurrence: 'FORTNIGHTLY', anchorDate: null }), 'missing recurrence anchor'],
		[night({ recurrence: 'MONTHLY', monthlyOrdinal: null }), 'missing monthly pattern']
	] as const) {
		const rows = buildWeek('2026-11-30', [{ ...r, lastConfirmed: '2026-11-28' }], []);
		assert.equal(rows.length, 1); //                 not dropped…
		assert.equal(rows[0].state, 'held'); //           …not publishable…
		assert.equal(rows[0].missing[0], reason); //      …and it says why
		const l = listing(rows, 'LIVE_BAND', '2026-11-30', 'week');
		assert.deepEqual([l.entries, l.unplaced, l.unconfirmed], [0, 1, 0]);
		assert.equal(l.days[5].held[0].why[0], reason);
	}
	assert.deepEqual(placeOn({ recurrence: 'SEASONAL' }, '2026-12-05'), { held: 'seasonal — no rule to place a date' });
});

test('the window is the longer of tier and period: fortnightly B at 12 days publishes, at 16 it does not', () => {
	const asOf = '2026-11-30';
	const b = (daysAgo: number, period: number) => ({ kind: 'standing' as const, lastConfirmed: addDays(asOf, -daysAgo), runningSince: null, firstConfirmedAt: addDays(asOf, -daysAgo), period });
	assert.equal(freshOn(b(12, 14), asOf), true);
	assert.equal(freshOn(b(16, 14), asOf), false);
	assert.equal(freshOn(b(12, 7), asOf), false); // the same night weekly: B's 10 days
	// Monthly B: 35 days, two "last Fridays" can be five weeks apart.
	assert.equal(freshOn(b(30, 35), asOf), true);
	assert.equal(freshOn(b(40, 35), asOf), false);
});

test('existing weekly nights expand exactly as before: every week, on their day', () => {
	for (let w = 0; w < 6; w++) {
		const week = addDays('2026-11-02', 7 * w);
		assert.deepEqual(buildWeek(week, [night({})], []).map((r) => r.date), [addDays(week, 5)]);
	}
});

test('register health: the weekly need falls when a weekly night turns fortnightly, nothing else changed', () => {
	const asOf = '2026-11-30';
	const n = (period: number): HealthNight => ({ kind: 'standing', lastConfirmed: addDays(asOf, -3), runningSince: null, firstConfirmedAt: addDays(asOf, -3), period, venue: 'V', eventName: 'N', startTime: '21:00', register: 'SOCIAL' });
	const book = Array.from({ length: 3 }, () => n(7));
	const before = registerHealth(book, asOf).needed;
	const after = registerHealth([...book.slice(1), n(14)], asOf).needed;
	assert.equal(before, 3); // 3 × 7/10 = 2.1, rounded up
	assert.equal(after, 2); //  2 × 7/10 + 7/14 = 1.9
	// (Whole calls a week, rounded up: on a larger book one change may not cross a whole number.)
	assert.equal(registerHealth(Array.from({ length: 10 }, () => n(7)), asOf).needed, 7); // 7.000000000000001 is 7
});
