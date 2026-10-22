// Reading a zone out of a venue's location text — the only place in the
// register that does area or zone resolution.
//
// A port of place_matcher.py (data/), the matcher the October register import
// used. It was debugged against the real 239 rows; its five fixes are marked
// below and all five are kept. The vocabulary is the AreaZone table, passed in
// by the caller, so the same code runs on the server and in the browser.
//
// What it returns is a reading of an address, never a claim about where a
// place is: callers show it ("read Muyenga out of the address") and let the
// operator override it. Nothing it returns is written into Venue.areas —
// those are surroundings, which an address does not tell you.

export interface AreaZoneRow {
	area: string; //    canonical display spelling
	zoneName: string;
}

export interface Place {
	/** The canonical area names a location names, in the order they appear. */
	areasFromLocation(location: string | null | undefined): string[];
	/** First one wins; the other zones the areas touch are returned, never to block. */
	zoneForAreas(areas: string[]): { zone: string | null; alsoTouches: string[] };
	/** Whether an area is in the vocabulary, and its canonical spelling. */
	canonical(area: string): string | null;
}

/**
 * Normalise for comparison.
 *
 * FIX 1: road suffixes are NOT stripped. 'Entebbe Rd.' and 'Entebbe' are
 * different places, as are 'Hoima Rd.' and 'Hoima'. Stripping the suffix
 * collapses them and sends venues to the wrong zone.
 */
export const key = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]/g, '');

// an area whose own name is a road
const ROADISH = /\b(rd|road|hwy|highway|express|expressway|ave|avenue|street|st)\b\.?$/i;

// 'Kampala-Masaka highway' — both halves name the road, neither is an area
const ROAD_COMPOUND = /\b([A-Za-z']+)\s*-\s*([A-Za-z']+)\s+(?:rd|road|hwy|highway|express\w*)\b\.?/gi;

export function placeResolver(map: AreaZoneRow[]): Place {
	const vocab = new Map<string, string>(); //  normalised key -> canonical display spelling
	const areaToZone = new Map<string, string>(); // normalised key -> zone name
	for (const row of map) {
		vocab.set(key(row.area), row.area);
		areaToZone.set(key(row.area), row.zoneName);
	}
	const roadArea = new Set([...vocab].filter(([, v]) => ROADISH.test(v)).map(([k]) => k));

	function areasFromLocation(loc: string | null | undefined) {
		if (!loc) return [];

		// FIX 2: words inside an 'X-Y Road' compound name the road, not a place.
		const inRoad = new Set<string>();
		for (const m of loc.matchAll(ROAD_COMPOUND)) {
			inRoad.add(key(m[1]));
			inRoad.add(key(m[2]));
		}

		const toks = loc.split(/[^A-Za-z0-9'.]+/).filter(Boolean);
		const hits: { start: number; end: number; display: string; road: boolean }[] = [];

		for (let i = 0; i < toks.length; i++) {
			// FIX 3: longest match first, so 'Bandali Rise' is tried before
			// 'Bandali' — and matching is on whole TOKENS, never substrings, so
			// 'Bandali Rise' can never yield 'Banda'.
			for (const n of [3, 2, 1]) {
				if (i + n > toks.length) continue;
				const k = key(toks.slice(i, i + n).join(' '));
				// FIX 4: a key shorter than 4 characters matches noise.
				if (k.length < 4 || !vocab.has(k)) continue;
				// no overlapping matches
				if (hits.some((h) => h.start <= i && i + n <= h.end)) continue;
				hits.push({ start: i, end: i + n, display: vocab.get(k)!, road: roadArea.has(k) || inRoad.has(k) });
				break;
			}
		}

		// FIX 5: a road name counts as an area only if nothing better matched.
		//
		// KNOWN WEAKNESS, left deliberately. The fallback is right for a road
		// named after two neighbourhoods it runs between — 'Kyanja - Komamboga
		// Rd.' does place a venue in Kyanja. It is wrong for an intercity road:
		// 'Kampala-Masaka highway' yields CBD, and that highway is 130km long.
		// Telling them apart needs a list of intercity roads, which is not worth
		// building. Treat a zone that came only from a road compound as a guess
		// the operator should see and be able to override — which is what the
		// "read X out of the address, change it if it's wrong" label is for.
		const plain = hits.filter((h) => !h.road);
		const chosen = plain.length ? plain : hits;

		const out: string[] = [];
		for (const h of chosen.sort((a, b) => a.start - b.start || a.end - b.end || cmp(a.display, b.display) || +a.road - +b.road)) {
			if (!out.includes(h.display)) out.push(h.display); // canonical spelling, never the input's casing
		}
		return out;
	}

	/**
	 * FIRST ONE WINS. This is what produced every zone in the register, and it
	 * is not arbitrary: Venue.areas holds the SURROUNDINGS someone listed for a
	 * venue, and people name the nearest or most identifying one first. 43 area
	 * names legitimately appear under more than one zone for this reason —
	 * surroundings are not a lookup table.
	 *
	 * The rest are returned so the caller can note them, never to block.
	 */
	function zoneForAreas(areas: string[]) {
		const zones: string[] = [];
		for (const a of areas) {
			const z = areaToZone.get(key(a));
			if (z && !zones.includes(z)) zones.push(z);
		}
		return { zone: zones[0] ?? null, alsoTouches: zones.slice(1) };
	}

	return { areasFromLocation, zoneForAreas, canonical: (area) => vocab.get(key(area)) ?? null };
}

// Python's string ordering (code points), which sorted() used on the tuples.
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
