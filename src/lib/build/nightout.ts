// "Write up a night out": finding the night the morning after. What you
// remember is often "that quiz place in Ntinda", not the name over the door,
// so venue name, night name, zone and category are searched together.
// Pure — the index is built on the server, searched in the browser.

export interface NightOption {
	kind: 'night';
	ref: string; //            a residency id or an occurrence id — what /attend takes
	venueId: string;
	venue: string;
	zone: string | null;
	eventName: string;
	category: string;
	dayOfWeek: number | null; // a standing night
	startTime: string | null;
	dates: string[]; //        the dates it ran in the last fortnight, most recent first
}

export interface VenueOption {
	kind: 'venue';
	venueId: string;
	venue: string;
	zone: string | null;
	noProgramme: boolean; //   reached once, said it runs nothing
}

export type Option = NightOption | VenueOption;

export const SHOWN = 8; // a list to choose from, not 240 rows behind a filter
const VENUE_ROOM = 3; //  kept for venues with nothing on file, so "kololo" still shows them

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replaceAll('_', ' ').replace(/\s+/g, ' ').trim();

/**
 * Before anything is typed: the nights that ran in the last fortnight — the
 * window the write-up allows, so the literal candidates. One row per night
 * and date, most recent first.
 */
export function recent(nights: NightOption[]) {
	return nights
		.flatMap((n) => n.dates.map((date) => ({ ...n, dates: [date] })))
		.sort((a, b) => b.dates[0].localeCompare(a.dates[0]) || a.venue.localeCompare(b.venue))
		.slice(0, SHOWN);
}

/**
 * Typed: nights that ran recently first (they lead straight to the write-up),
 * then venues with nothing on file in the fortnight (they need the night added
 * first). A venue marked "runs nothing" only appears by its exact name — being
 * there contradicts the flag, but it shouldn't clutter every search.
 */
export function search(nights: NightOption[], venues: VenueOption[], query: string): Option[] {
	const q = norm(query);
	if (!q) return recent(nights);
	const hit = (...fields: (string | null)[]) => fields.some((f) => norm(f).includes(q));
	const nightHits = nights.filter((n) => n.dates.length && hit(n.venue, n.eventName, n.zone, n.category));
	const venueHits = venues.filter((v) => (v.noProgramme ? norm(v.venue) === q : hit(v.venue, v.zone)));
	// Nights rank first, but never crowd out the nightless venues entirely: a
	// spontaneous night is usually at one of those.
	const venueRows = venueHits.slice(0, Math.min(VENUE_ROOM, venueHits.length, SHOWN));
	return [...nightHits.slice(0, SHOWN - venueRows.length), ...venueRows, ...venueHits.slice(venueRows.length)].slice(0, SHOWN);
}
