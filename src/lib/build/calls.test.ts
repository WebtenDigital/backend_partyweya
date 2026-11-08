// node --test src/lib/build/calls.test.ts — no database needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callQueue, owedNow, rowDate, type QueueResidency, type QueueOccurrence, type QueueVenue } from './calls.ts';

const today = '2026-10-21'; // a Wednesday
const week = '2026-10-26'; //  the build week it's working on

const venue = (id: string, conversationTest: string | null = 'CAN_TALK'): QueueVenue => ({ id, name: id, zone: null, phone: null, conversationTest });
const night = (o: Partial<QueueResidency> & { id: string; venueId: string }): QueueResidency => ({
	organiserId: null, bookingPhone: null, bookingPhoneNote: null, eventName: o.id, category: 'DJ', dayOfWeek: 5,
	startTime: '21:00', lastConfirmed: '2026-10-20', attendedAt: null, ...o
});
const dated = (o: Partial<QueueOccurrence> & { id: string; venueId: string; date: string }): QueueOccurrence => ({
	organiserId: null, residencyId: null, bookingPhone: null, bookingPhoneNote: null, eventName: o.id,
	startTime: '21:00', priceGate: 0, register: 'SOCIAL', status: 'CONFIRMED', ...o
});
const owed = (q: ReturnType<typeof callQueue>, reminders: { due: string | null }[] = []) => owedNow(q, reminders, today);

test('nothing blocking or overdue: zero', () => {
	assert.equal(owed(callQueue(week, [], [], [])), 0);
});

test('the two blocking groups count, one per row', () => {
	const q = callQueue(week, [venue('a'), venue('b')], [night({ id: 'untimed', venueId: 'b', startTime: null })], [dated({ id: 'lead', venueId: 'a', date: '2026-10-30', status: 'LEAD' })]);
	assert.deepEqual(q.map((r) => r.group).sort(), ['every-week', 'this-week']);
	assert.equal(owed(q), 2);
});

test('a monthly-sweep row does not move the badge', () => {
	const before = callQueue(week, [venue('a')], [], []);
	const after = callQueue(week, [venue('a')], [night({ id: 'held', venueId: 'a', lastConfirmed: '2026-08-01' })], [], [], [
		{ venueId: 'a', tier: 'A', due: '2026-08-31', lastConfirmed: '2026-08-01', standingC: false }
	]);
	assert.equal(after[0].group, 'due'); // tier A is cadence now — and still not counted
	assert.equal(owed(after), owed(before));
});

test('unclassified rows do not count', () => {
	const q = callQueue(week, [venue('a', null)], [night({ id: 'fine', venueId: 'a' })], []);
	assert.equal(q[0].group, 'unclassified');
	assert.equal(owed(q), 0);
});

test('a cadence due today or earlier counts; later this week does not', () => {
	const q = callQueue(week, [venue('new'), venue('late'), venue('later')], [], [], [], [
		{ venueId: 'new', tier: 'C', due: today, lastConfirmed: null, standingC: true },
		{ venueId: 'late', tier: 'B', due: '2026-10-08', lastConfirmed: '2026-10-01', standingC: false },
		{ venueId: 'later', tier: 'B', due: '2026-10-27', lastConfirmed: '2026-10-20', standingC: false }
	]);
	assert.equal(owed(q), 2);
});

test('reminders count when overdue or due today — not later, not undated', () => {
	assert.equal(owed([], [{ due: '2026-10-19' }, { due: today }, { due: '2026-10-23' }, { due: null }]), 2);
});

test('each row is dated by what drives it, and nothing is dated by invention', () => {
	const q = callQueue(week, [venue('a'), venue('b'), venue('c'), venue('d', null), venue('e')], [
		night({ id: 'untimed', venueId: 'b', startTime: null, dayOfWeek: 5 }),
		night({ id: 'held', venueId: 'c', lastConfirmed: '2026-08-01' }),
		night({ id: 'attended', venueId: 'e', lastConfirmed: '2026-10-19', attendedAt: '2026-10-19' }),
		night({ id: 'unclassed', venueId: 'd' })
	], [dated({ id: 'lead', venueId: 'a', date: '2026-10-30', status: 'LEAD' })], [], [
		{ venueId: 'c', tier: 'A', due: '2026-08-31', lastConfirmed: '2026-08-01', standingC: false }
	]);
	const date = (id: string) => rowDate(q.find((r) => r.venue.id === id)!);
	assert.equal(date('a'), '2026-10-30'); //  the night
	assert.equal(date('b'), '2026-10-30'); //  this week's Friday
	assert.equal(date('c'), '2026-08-31'); //  the derived due date: a month after confirming
	assert.equal(date('e'), null); //         attended, not called since: nothing dates it
	assert.equal(date('d'), null); //         unclassified: no date
});

test('the derived cadence: A and B are cadence; a never-confirmed standing night is before publishing', () => {
	const q = callQueue(week, [venue('a'), venue('b'), venue('c')], [], [], [], [
		{ venueId: 'a', tier: 'A', due: today, lastConfirmed: '2026-09-21', standingC: false },
		{ venueId: 'b', tier: 'B', due: today, lastConfirmed: '2026-10-14', standingC: false },
		{ venueId: 'c', tier: 'C', due: today, lastConfirmed: null, standingC: true }
	]);
	assert.deepEqual(Object.fromEntries(q.map((r) => [r.venue.id, r.group])), { a: 'due', b: 'due', c: 'this-week' });
	assert.equal(owed(q), 2); // B and C count; A, the monthly sweep, does not
});

test('a never-confirmed night is not monthly sweep: in the window it is before publishing, and said once', () => {
	const q = callQueue(week, [venue('buffaloes')], [night({ id: 'rhythm', venueId: 'buffaloes', lastConfirmed: null })], [], [], [
		{ venueId: 'buffaloes', tier: 'C', due: today, lastConfirmed: null, standingC: true }
	], [{ residencyId: 'rhythm', date: '2026-10-30' }]);
	assert.equal(q.length, 1);
	assert.equal(q[0].group, 'this-week');
	assert.equal(q[0].items.length, 1);
});

test('a tier C from a one-off outside the window is not before publishing', () => {
	const q = callQueue(week, [venue('far')], [], [], [], [{ venueId: 'far', tier: 'C', due: today, lastConfirmed: null, standingC: false }]);
	assert.deepEqual(q, []);
});
