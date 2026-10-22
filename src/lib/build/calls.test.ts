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
const owed = (q: ReturnType<typeof callQueue>, vouches: { state: 'EXPIRING' | 'EXPIRED' }[] = [], reminders: { due: string | null }[] = []) =>
	owedNow(q, vouches, reminders, today);

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
	const after = callQueue(week, [venue('a')], [night({ id: 'lapsed', venueId: 'a', lastConfirmed: '2026-08-01' })], []);
	assert.equal(after[0].group, 'sweep');
	assert.equal(owed(after), owed(before));
});

test('unclassified rows do not count', () => {
	const q = callQueue(week, [venue('a', null)], [night({ id: 'fine', venueId: 'a' })], []);
	assert.equal(q[0].group, 'unclassified');
	assert.equal(owed(q), 0);
});

test('a cadence due today or earlier counts; later this week does not', () => {
	const q = callQueue(week, [venue('new'), venue('late'), venue('later')], [], [], [], [
		{ venueId: 'new', lastContacted: null, nextContactDue: today },
		{ venueId: 'late', lastContacted: '2026-10-01', nextContactDue: '2026-10-08' },
		{ venueId: 'later', lastContacted: '2026-10-20', nextContactDue: '2026-10-27' }
	]);
	assert.equal(owed(q), 2);
});

test('an EXPIRED vouch counts, an EXPIRING one does not', () => {
	assert.equal(owed([], [{ state: 'EXPIRING' }]), 0);
	assert.equal(owed([], [{ state: 'EXPIRED' }, { state: 'EXPIRING' }]), 1);
});

test('reminders count when overdue or due today — not later, not undated', () => {
	assert.equal(owed([], [], [{ due: '2026-10-19' }, { due: today }, { due: '2026-10-23' }, { due: null }]), 2);
});

test('each row is dated by what drives it, and nothing is dated by invention', () => {
	const q = callQueue(week, [venue('a'), venue('b'), venue('c'), venue('d', null), venue('e')], [
		night({ id: 'untimed', venueId: 'b', startTime: null, dayOfWeek: 5 }),
		night({ id: 'lapsed', venueId: 'c', lastConfirmed: '2026-08-01' }),
		night({ id: 'never', venueId: 'e', lastConfirmed: null }),
		night({ id: 'unclassed', venueId: 'd' })
	], [dated({ id: 'lead', venueId: 'a', date: '2026-10-30', status: 'LEAD' })]);
	const date = (id: string) => rowDate(q.find((r) => r.venue.id === id)!);
	assert.equal(date('a'), '2026-10-30'); //  the night
	assert.equal(date('b'), '2026-10-30'); //  this week's Friday
	assert.equal(date('c'), '2026-09-05'); //  the day the sweep lapsed
	assert.equal(date('e'), null); //         never confirmed: no date
	assert.equal(date('d'), null); //         unclassified: no date
});
