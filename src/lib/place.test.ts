// node --test src/lib/place.test.ts — no database needed: the vocabulary is the
// CSV the AreaZone table was seeded from.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { placeResolver } from './place.ts';

const csv = readFileSync(new URL('../../data/partyweya_area_zone_map.csv', import.meta.url), 'utf8');
const { areasFromLocation, zoneForAreas, canonical } = placeResolver(
	csv
		.trim()
		.split('\n')
		.slice(1)
		.map((line) => {
			const [area, zoneName] = line.split(',');
			return { area, zoneName };
		})
);
const zoneOf = (loc: string) => zoneForAreas(areasFromLocation(loc)).zone;

test('1420’s address places it in BUGOLOBI, not CBD', () => {
	const areas = areasFromLocation('Plot 14, 20 Luthuli Rise Bugolobi, Kampala');
	assert.equal(areas[0], 'Bugolobi');
	assert.deepEqual(zoneForAreas(areas), { zone: 'BUGOLOBI', alsoTouches: ['CBD'] });
});

test('word boundaries, longest first: Bandali Rise never yields Banda', () => {
	assert.deepEqual(areasFromLocation('Bandali Rise'), ['Bandali Rise']);
	assert.deepEqual(areasFromLocation('Bandali Rise, Bugolobi'), ['Bandali Rise', 'Bugolobi']);
	assert.ok(!areasFromLocation('Bandali Rise, Bugolobi').includes('Banda'));
});

test('road suffixes are not stripped: Entebbe Rd. is not Entebbe, Hoima Rd. is not Hoima', () => {
	assert.deepEqual(areasFromLocation('Entebbe Rd., near the airport'), ['Entebbe Rd.']);
	assert.equal(zoneOf('Entebbe Rd.'), 'ENTEBBE RD. SOUTH');
	assert.ok(!areasFromLocation('Hoima Rd., Nateete').includes('Hoima'));
	assert.equal(zoneOf('Hoima Rd., Nateete'), 'RUBAGA');
});

test('an X-Y road names a road: a plain area beats it', () => {
	assert.deepEqual(areasFromLocation('Kampala-Masaka highway, Nateete'), ['Nateete']);
});

test('known weakness, kept: an intercity road alone falls back to its halves', () => {
	// Wrong for a 130km highway, right for "Kyanja - Komamboga Rd." — the label
	// on screen is what lets the operator override it.
	assert.deepEqual(areasFromLocation('Kampala-Masaka highway, after Freedom City'), ['Kampala', 'Masaka']);
	assert.equal(zoneOf('Kyanja - Komamboga Rd., next to New City Center Complex'), 'KYANJA');
});

test('nothing named, nothing guessed', () => {
	assert.deepEqual(areasFromLocation('Behind Igar Petrol Station'), []);
	assert.deepEqual(zoneForAreas([]), { zone: null, alsoTouches: [] });
	assert.deepEqual(areasFromLocation(''), []);
	assert.deepEqual(areasFromLocation(null), []);
});

test('canonical spelling out, whatever the input’s casing', () => {
	assert.deepEqual(areasFromLocation('TANK HILL RD, muyenga'), ['Muyenga']);
	assert.equal(zoneOf('Tank Hill Rd, Muyenga'), 'KABALAGALA–MUYENGA');
	assert.equal(canonical('ew antoni'), "Ew'Antoni");
	assert.equal(canonical('Kiira'), null);
});

test('zone is first-one-wins; the rest are “also touches”, never a block', () => {
	assert.deepEqual(zoneForAreas(['Bandali Rise', 'Nakawa', 'Bukoto']), { zone: 'BUGOLOBI', alsoTouches: ['BUKOTO–NTINDA'] });
	assert.deepEqual(zoneForAreas(['Kololo', 'Bukoto']), { zone: 'KOLOLO', alsoTouches: ['BUKOTO–NTINDA'] });
	// outside the vocabulary: ignored, not guessed at
	assert.deepEqual(zoneForAreas(['Kiira', 'Kitukutwe']), { zone: 'KIREKA–BWEYOGERERE', alsoTouches: [] });
});
