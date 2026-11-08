// Discovery: venues with no night on file, and nobody has asked what they run.
// They have nothing pending, so no date-driven query can ever see them — this
// list is how they get called at all. Pure functions only (no database), so
// the queue can rank with them and the tests can run without one.
//
// A venue leaves this list when a night is recorded against it, when it's
// reached and runs nothing (noProgramme), or after UNREACHABLE_AFTER no-answers
// in a row. Never because someone merely answered: one call to a barman who
// doesn't know the programme would mark it done forever.

export type ExpectedRegister = 'LIKELY_QUIET' | 'LIKELY_LOUD' | 'UNKNOWN';

const QUIET = ['cafe', 'café', 'coffee', 'tea', 'restaurant', 'grill', 'eatery', 'bistro', 'deli', 'bakery', 'garden', 'terrace', 'rooftop', 'lounge', 'hotel', 'resort'];
const LOUD = ['club', 'nightclub', 'disco', 'arena'];

/**
 * A guess from the venue's name — shown on the row as a guess, and wrong often.
 * Calling the likely-quiet first is how Chill gets filled; the label is how we
 * find out whether the heuristic earns its place. Whole words only: "Teak" is
 * not tea, "Clubhouse" is not club.
 */
export function expectedRegister(venueName: string): ExpectedRegister {
	const words = new Set(venueName.toLowerCase().normalize('NFC').split(/[^\p{L}\p{N}]+/u).filter(Boolean));
	const has = (list: string[]) => list.some((w) => words.has(w) || words.has(`${w}s`)); // "Gardens", "Grills"
	if (has(LOUD)) return 'LIKELY_LOUD';
	if (has(QUIET)) return 'LIKELY_QUIET';
	return 'UNKNOWN';
}

export const UNREACHABLE_AFTER = 4;
export const DISCOVERY_CAP = 25;

export interface DiscoveryVenue {
	id: string;
	name: string;
	zone: string | null;
	phones: string[];
	lastContacted: string | null;
	contactAttempts: number;
}

const BUCKET: Record<ExpectedRegister, number> = { LIKELY_QUIET: 0, UNKNOWN: 1, LIKELY_LOUD: 2 };

/**
 * The order to call them in: likely-quiet, then unknown, then likely-loud;
 * within each, zones thinnest in recorded nights first; then never-called
 * before tried-already. `nightsByZone` counts venues that have a night on file.
 */
export function rankDiscovery<V extends DiscoveryVenue>(venues: V[], nightsByZone: Map<string | null, number>) {
	const thin = (v: V) => nightsByZone.get(v.zone) ?? 0;
	return venues
		.map((v) => ({ ...v, expected: expectedRegister(v.name) }))
		.sort(
			(a, b) =>
				BUCKET[a.expected] - BUCKET[b.expected] ||
				thin(a) - thin(b) ||
				Number(a.lastContacted != null || a.contactAttempts > 0) - Number(b.lastContacted != null || b.contactAttempts > 0) ||
				a.name.localeCompare(b.name)
		);
}

/** No answer: try again on the next working day (Monday to Friday). */
export function nextWorkingDay(today: string) {
	const d = new Date(`${today}T00:00:00Z`);
	do d.setUTCDate(d.getUTCDate() + 1);
	while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
	return d.toISOString().slice(0, 10);
}
