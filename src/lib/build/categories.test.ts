// node --test src/lib/build/categories.test.ts — no database needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, listing, weekCounts } from './categories.ts';
import { buildWeek, type OccurrenceIn, type ResidencyIn } from './week.ts';

const week = '2026-11-30';
const venue = (id: string, paidClient = false) => ({ id, name: id, zone: 'KOLOLO', division: null, phone: null, paidClient });
const res = (o: Partial<ResidencyIn> & { id: string; dayOfWeek: number }): ResidencyIn => ({
	venue: venue(o.id), eventName: o.id, category: 'LIVE_BAND', startTime: '21:00', prices: [], register: 'SOCIAL', recurrence: 'WEEKLY',
	claimType: 'FACTUAL', source: 'OWNER', lastConfirmed: '2026-11-25', attendedAt: null, attendedBy: null, clearsF2: null, lineup: [], perks: [], ...o
});
const occ = (o: Partial<OccurrenceIn> & { id: string; date: string }): OccurrenceIn => ({
	venue: venue(o.id), residencyId: null, eventName: o.id, category: 'LIVE_BAND', startTime: '20:00', prices: [], register: 'SOCIAL',
	claimType: 'FACTUAL', source: 'OWNER', status: 'CONFIRMED', confirmedOn: '2026-11-25', attendedAt: null, attendedBy: null, clearsF2: null, lineup: [], perks: [], ...o
});
const names = (l: ReturnType<typeof listing>) => l.days.flatMap((d) => d.entries.map((r) => r.eventName));

test('a night is on its own category page and on no other', () => {
	const rows = buildWeek(week, [res({ id: 'band', dayOfWeek: 2 }), res({ id: 'quiz', dayOfWeek: 2, category: 'QUIZ' })], []);
	assert.deepEqual(names(listing(rows, 'LIVE_BAND', week, 'week')), ['band']);
	assert.deepEqual(names(listing(rows, 'QUIZ', week, 'week')), ['quiz']);
	for (const c of CATEGORIES.filter((c) => c !== 'LIVE_BAND' && c !== 'QUIZ')) assert.equal(listing(rows, c, week, 'week').entries, 0);
});

test('STANDING ONLY keeps the rules; THIS WEEK adds one-offs and this date’s changes', () => {
	const rows = buildWeek(
		week,
		[res({ id: 'tue', dayOfWeek: 2 }), res({ id: 'fri', dayOfWeek: 5 })],
		[occ({ id: 'launch', date: '2026-12-03' }), occ({ id: 'fri-special', date: '2026-12-04', residencyId: 'fri', eventName: 'Fri special' })]
	);
	assert.deepEqual(names(listing(rows, 'LIVE_BAND', week, 'week')), ['tue', 'launch', 'Fri special']);
	assert.deepEqual(names(listing(rows, 'LIVE_BAND', week, 'standing')), ['tue']); // the override replaced Friday's rule in these rows
	const rules = buildWeek(week, [res({ id: 'tue', dayOfWeek: 2 }), res({ id: 'fri', dayOfWeek: 5 })], []); // loadWeek's standingOnly
	assert.deepEqual(names(listing(rules, 'LIVE_BAND', week, 'standing')), ['tue', 'fri']);
});

test('no start time is held out and shown as a gap; unconfirmed never lists', () => {
	const rows = buildWeek(
		week,
		[res({ id: 'timeless', dayOfWeek: 3, startTime: null }), res({ id: 'stale', dayOfWeek: 3, lastConfirmed: null })],
		[occ({ id: 'lead', date: '2026-12-02', status: 'LEAD', confirmedOn: null })]
	);
	const l = listing(rows, 'LIVE_BAND', week, 'week');
	assert.equal(l.entries, 0);
	assert.deepEqual([l.held, l.noStart, l.unconfirmed], [3, 1, 2]);
	const wed = l.days.find((d) => d.date === '2026-12-02')!;
	assert.deepEqual(wed.held.map((h) => [h.row.eventName, h.why.join(', ')]).sort(), [['lead', 'unconfirmed'], ['stale', 'unconfirmed'], ['timeless', 'no start time']]);
});

test('every day Monday to Sunday is present, empty or not', () => {
	const l = listing(buildWeek(week, [res({ id: 'sat', dayOfWeek: 6 })], []), 'LIVE_BAND', week, 'week');
	assert.equal(l.days.length, 7);
	assert.deepEqual(l.days.map((d) => d.entries.length), [0, 0, 0, 0, 0, 1, 0]);
});

test('ordered by night then start time — identical whether or not a row is a paid client', () => {
	const nights = [res({ id: 'late', dayOfWeek: 5, startTime: '23:00' }), res({ id: 'early', dayOfWeek: 5, startTime: '19:00' }), res({ id: 'mon', dayOfWeek: 1, startTime: '22:00' })];
	const plain = names(listing(buildWeek(week, nights, []), 'LIVE_BAND', week, 'week'));
	const paid = nights.map((n) => (n.id === 'late' ? { ...n, venue: venue('late', true) } : n));
	const l = listing(buildWeek(week, paid, []), 'LIVE_BAND', week, 'week');
	assert.deepEqual(plain, ['mon', 'early', 'late']);
	assert.deepEqual(names(l), plain);
	assert.equal(l.paid, 1);
});

test('the index counts every category, zeros included', () => {
	const counts = weekCounts(buildWeek(week, [res({ id: 'band', dayOfWeek: 2 })], []));
	assert.deepEqual(Object.keys(counts), [...CATEGORIES]);
	assert.equal(counts.LIVE_BAND, 1);
	assert.equal(counts.POETRY, 0);
});
