// node --test src/lib/server/discovery.test.ts — no database needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expectedRegister, nextWorkingDay, rankDiscovery, type DiscoveryVenue } from './discovery.ts';

test('quiet words: cafés, restaurants, gardens, lounges, hotels', () => {
	for (const n of ['Cafesserie Café', 'Coffee at Last', 'Tea House', 'Faze 3 Restaurant', 'Cabrito Grill & Lounge', 'Kampala Eatery', 'Donel’s Bistro', 'Corner Deli', 'Brood Bakery', 'Goers Gardens', 'The Terrace', 'Rooftop 360', 'Anex Lounge', 'Afropark Hotel', 'Fusion Eco Resort'])
		assert.equal(expectedRegister(n), 'LIKELY_QUIET', n);
});

test('loud words: club, nightclub, disco, arena', () => {
	for (const n of ['Afro Club Kasangati', 'Guvnor Nightclub', 'Disco Inferno', 'Kings Park Arena', 'CLUB 791']) assert.equal(expectedRegister(n), 'LIKELY_LOUD', n);
});

test('loud wins a name that says both — a hotel nightclub is a nightclub', () => {
	assert.equal(expectedRegister('Sheraton Hotel Nightclub'), 'LIKELY_LOUD');
});

test('everything else is UNKNOWN, and words only match whole', () => {
	for (const n of ['Bada Bing', '1420', 'Kla +256 Social', 'Teak Bar', 'The Clubhouse', 'Thrones']) assert.equal(expectedRegister(n), 'UNKNOWN', n);
});

const v = (name: string, zone: string | null, o: Partial<DiscoveryVenue> = {}): DiscoveryVenue => ({
	id: name, name, zone, phones: ['0772 000000'], lastContacted: null, contactAttempts: 0, ...o
});

test('ranked: quiet, then unknown, then loud; thin zones first; never called before tried', () => {
	const nights = new Map<string | null, number>([['KOLOLO', 9], ['NANSANA', 1]]);
	const ranked = rankDiscovery(
		[
			v('Afro Club', 'NANSANA'),
			v('Bada Bing', 'NANSANA'),
			v('Kololo Lounge', 'KOLOLO'),
			v('Nansana Lounge', 'NANSANA', { contactAttempts: 2 }),
			v('Nansana Cafe', 'NANSANA'),
			v('Unzoned Grill', null)
		],
		nights
	);
	assert.deepEqual(ranked.map((r) => [r.name, r.expected]), [
		['Unzoned Grill', 'LIKELY_QUIET'], //  zone with no nights on file at all: thinnest
		['Nansana Cafe', 'LIKELY_QUIET'], //   thin zone, never called
		['Nansana Lounge', 'LIKELY_QUIET'], // thin zone, tried twice
		['Kololo Lounge', 'LIKELY_QUIET'], //  thick zone
		['Bada Bing', 'UNKNOWN'],
		['Afro Club', 'LIKELY_LOUD']
	]);
});

test('no answer rolls to the next working day', () => {
	assert.equal(nextWorkingDay('2026-11-09'), '2026-11-10'); // Mon → Tue
	assert.equal(nextWorkingDay('2026-11-13'), '2026-11-16'); // Fri → Mon
	assert.equal(nextWorkingDay('2026-11-08'), '2026-11-09'); // Sun → Mon
});
