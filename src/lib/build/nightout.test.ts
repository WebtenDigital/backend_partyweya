// node --test src/lib/build/nightout.test.ts — no database needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recent, search, SHOWN, type NightOption, type VenueOption } from './nightout.ts';

const night = (o: Partial<NightOption> & { ref: string; venue: string }): NightOption => ({
	kind: 'night', venueId: o.ref, zone: null, eventName: o.ref, category: 'DJ', dayOfWeek: null, startTime: '21:00', dates: ['2026-11-07'], ...o
});
const venue = (o: Partial<VenueOption> & { venueId: string; venue: string }): VenueOption => ({ kind: 'venue', zone: null, noProgramme: false, ...o });

const nights = [
	night({ ref: 'tehilas-karquiz', venue: 'Tehila’s Cafe and Grill', zone: 'CBD', eventName: 'KarQuiz', category: 'QUIZ', dates: ['2026-11-03'] }),
	night({ ref: 'aands-quiz', venue: 'A&S Health Club', zone: 'KYANJA', eventName: 'Quiz Night', category: 'QUIZ', dates: ['2026-11-02'] }),
	night({ ref: 'catwalk-sat', venue: 'Catwalk Bar & Lounge', zone: 'KOLOLO', eventName: 'Blackout Saturday', category: 'DJ', dates: ['2026-11-07'] }),
	night({ ref: 'villa-band', venue: 'The Villa', zone: 'KABALAGALA–MUYENGA', eventName: 'Monday Escape', category: 'LIVE_BAND', dates: ['2026-11-02'] }),
	night({ ref: 'far-future', venue: 'Mezo Noir', zone: 'KOLOLO', eventName: 'Festival', category: 'CONCERT', dates: [] })
];
const venues = [
	venue({ venueId: 'guvnor', venue: 'Guvnor', zone: 'KOLOLO' }),
	venue({ venueId: 'bushpig', venue: 'Bushpig Backpackers', zone: 'KOLOLO' }),
	venue({ venueId: 'quiet', venue: 'Quiet Place', zone: 'NTINDA', noProgramme: true })
];
const names = (q: string) => search(nights, venues, q).map((o) => (o.kind === 'night' ? o.ref : o.venueId));

test('a zone name finds the venues in it whose names say nothing of it', () => {
	assert.deepEqual(names('kololo'), ['catwalk-sat', 'guvnor', 'bushpig']);
});

test('a night name finds its venue; a category finds its nights', () => {
	assert.deepEqual(names('karquiz'), ['tehilas-karquiz']);
	assert.deepEqual(names('quiz'), ['tehilas-karquiz', 'aands-quiz']);
	assert.deepEqual(names('live band'), ['villa-band']);
});

test('nights that ran recently rank above venues with nothing on file', () => {
	const kinds = search(nights, venues, 'kololo').map((o) => o.kind);
	assert.deepEqual(kinds, ['night', 'venue', 'venue']);
});

test('a night that didn’t run in the fortnight is never offered — its venue isn’t a night row', () => {
	assert.ok(!names('festival').includes('far-future'));
});

test('the empty state is only the last fortnight’s nights, most recent first', () => {
	const r = recent(nights);
	assert.deepEqual(r.map((o) => [o.ref, o.dates[0]]), [
		['catwalk-sat', '2026-11-07'],
		['tehilas-karquiz', '2026-11-03'],
		['aands-quiz', '2026-11-02'],
		['villa-band', '2026-11-02']
	]);
	assert.deepEqual(search(nights, venues, '   ').map((o) => (o as NightOption).ref), r.map((o) => o.ref));
});

test('a venue marked "runs nothing" is absent until its exact name is typed', () => {
	assert.ok(!names('quiet').includes('quiet'));
	assert.ok(!names('ntinda').includes('quiet'));
	assert.deepEqual(names('Quiet Place'), ['quiet']);
});

test('capped: a list to choose from, not every row behind a filter', () => {
	const many = Array.from({ length: 30 }, (_, i) => venue({ venueId: `v${i}`, venue: `Lounge ${i}` }));
	assert.equal(search([], many, 'lounge').length, SHOWN);
});

test('a busy search never crowds out every venue with nothing on file', () => {
	const busy = Array.from({ length: 12 }, (_, i) => night({ ref: `n${i}`, venue: `Kololo Bar ${i}`, zone: 'KOLOLO' }));
	const r = search(busy, venues, 'kololo');
	assert.equal(r.length, SHOWN);
	assert.deepEqual(r.filter((o) => o.kind === 'venue').map((o) => (o as VenueOption).venueId), ['guvnor', 'bushpig']);
});
