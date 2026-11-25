// Category pages: one category's nights for a week, as a DIRECTORY — a
// factual list, not an editorial one. So the Sunday gate's rules (all three
// registers, something vetted) don't apply here, and two checks do: every
// entry has a start time, and nothing unconfirmed is listed. A held-out row
// is shown as a gap, never silently dropped.
//
// Never ranked. The order is the night, then the start time, then the venue's
// name to settle ties — the same with or without a paid client in it. Paid
// INCLUSION in a factual list is a product; paid PLACEMENT would be a pick.
//
// Pure: the rows come from buildWeek (the Sunday Build's own expansion).

import { addDays, type Row } from './week.js';

/** Every category, in the enum's order — a zero is information, so none is ever hidden. */
export const CATEGORIES = [
	'LIVE_BAND',
	'DJ',
	'KARAOKE',
	'QUIZ',
	'ACOUSTIC',
	'POETRY',
	'COMEDY',
	'BRUNCH',
	'PAGEANT',
	'CONCERT',
	'SPORTS_SCREENING',
	'THEMED_NIGHT',
	'MOVIE_NIGHT',
	'OTHER'
] as const;
export type CategoryKey = (typeof CATEGORIES)[number];

export const isCategory = (c: string | null | undefined): c is CategoryKey => !!c && (CATEGORIES as readonly string[]).includes(c);
export const categoryLabel = (c: string) => c.replaceAll('_', ' ').toLowerCase().replace(/^./, (x) => x.toUpperCase());

export type Mode = 'week' | 'standing';

/** Why a row is held out of the listing. A row without a start time is not a row; an unconfirmed one is not a fact. */
export function heldBecause(r: Row): string[] {
	return [
		r.state === 'held' && r.missing[0], // a rule that can't be placed this week: its reason, first
		!r.startTime && 'no start time',
		r.state === 'lead' && 'unconfirmed',
		r.state === 'changed' && 'changed — re-verify'
	].filter(
		(x): x is string => !!x
	);
}

/** Night, then start time, then venue and name — never preference, never paid status. */
export const byNight = (a: Row, b: Row) =>
	a.date.localeCompare(b.date) ||
	(a.startTime ?? '99').localeCompare(b.startTime ?? '99') ||
	a.venue.name.localeCompare(b.venue.name) ||
	a.eventName.localeCompare(b.eventName);

export interface Listing {
	days: { date: string; entries: Row[]; held: { row: Row; why: string[] }[] }[]; // Monday to Sunday, empty days kept
	entries: number;
	held: number;
	noStart: number;
	unconfirmed: number;
	unplaced: number; // a rule this week can't be placed from (no anchor, no monthly pattern)
	paid: number; // entries whose venue is a paid client — counted, never reordered
}

/**
 * One category's week. In 'standing' mode the rows should come from the
 * standing nights alone (loadWeek's standingOnly); this keeps STANDING rows
 * only as well, so a one-off or an override can never slip in.
 */
export function listing(rows: Row[], category: string, week: string, mode: Mode): Listing {
	const mine = rows.filter((r) => r.category === category && (mode === 'week' || r.kind === 'STANDING')).sort(byNight);
	const days = Array.from({ length: 7 }, (_, i) => addDays(week, i)).map((date) => {
		const night = mine.filter((r) => r.date === date);
		return {
			date,
			entries: night.filter((r) => !heldBecause(r).length),
			held: night.filter((r) => heldBecause(r).length).map((row) => ({ row, why: heldBecause(row) }))
		};
	});
	const entries = days.flatMap((d) => d.entries);
	const held = days.flatMap((d) => d.held);
	return {
		days,
		entries: entries.length,
		held: held.length,
		noStart: held.filter((h) => !h.row.startTime).length,
		unconfirmed: held.filter((h) => h.row.state === 'lead' || h.row.state === 'changed').length,
		unplaced: held.filter((h) => h.row.state === 'held').length,
		paid: entries.filter((r) => r.venue.paidClient).length
	};
}

/** Nights that week per category, every category present — zeros included. */
export function weekCounts(rows: Row[]): Record<CategoryKey, number> {
	const counts = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<CategoryKey, number>;
	for (const r of rows) if (isCategory(r.category)) counts[r.category]++;
	return counts;
}
