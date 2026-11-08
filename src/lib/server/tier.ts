// A tier is a property of a venue's NIGHTS, not of the venue — derived on
// every request, never stored. Venue.tier and Venue.nextContactDue were set
// once (at import, or by the last call) and never recomputed, so a night typed
// in and never verified sat in the monthly sweep looking like a roster.
//
// Tier A, from the Supply Register protocol: recurring nights CONFIRMED and
// HELD 3+ months. "Confirmed" needs at least one confirmation from us. "Held"
// is either the venue's own claim (Residency.runningSince, question 4 of the
// call script) or our own history (Residency.firstConfirmedAt) reaching three
// months back — the second needs nobody to remember to ask, so tier A fills
// by itself as our confirmations age.
//
// Pure functions, no database: dates are YYYY-MM-DD in Kampala's calendar.

import { addDays } from '../build/week.js';

export type NightTier = 'A' | 'B' | 'C' | 'DONE';
export type VenueTier = 'A' | 'B' | 'C';

export type Night =
	| {
			kind: 'standing';
			lastConfirmed: string | null; //    our last confirmation of the rule
			runningSince: string | null; //     the venue's claim; null = not asked
			firstConfirmedAt?: string | null; // our first confirmation; set once
	  }
	| {
			kind: 'one-off';
			date: string;
			confirmed: boolean; // status CONFIRMED
	  };

export const HELD_MONTHS = 3;
export const DUE_AFTER: Record<'A' | 'B', number> = { A: 30, B: 7 };

/** The same day, `n` months earlier — clamped to the month's end (31 May − 3 months = 28/29 Feb). */
export function monthsBefore(date: string, n: number) {
	const [y, m, d] = date.split('-').map(Number);
	const first = new Date(Date.UTC(y, m - 1 - n, 1));
	const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
	first.setUTCDate(Math.min(d, last));
	return first.toISOString().slice(0, 10);
}

/**
 *   never confirmed                                  → C
 *   one-off, confirmed or already past               → DONE
 *   recurring, confirmed, held < 3 months or unknown → B
 *   recurring, confirmed, held 3+ months             → A
 *     held = running since 3+ months ago (their word)
 *         OR first confirmed by us 3+ months ago (our record)
 */
export function tierForNight(night: Night, today: string): NightTier {
	if (night.kind === 'one-off') return night.confirmed || night.date < today ? 'DONE' : 'C';
	if (!night.lastConfirmed) return 'C';
	const since = monthsBefore(today, HELD_MONTHS);
	const held = (night.runningSince != null && night.runningSince <= since) || (night.firstConfirmedAt != null && night.firstConfirmedAt <= since);
	return held ? 'A' : 'B';
}

/**
 * When the night next needs a call. C is due now: a never-confirmed standing
 * night is in every build window. B a week after its last confirmation, A a
 * month after — so venues confirmed on different days come due on different
 * days, and the monthly sweep spreads itself across the weeks with nothing
 * added to make it.
 */
export function dueDateForNight(night: Night, today: string): string | null {
	const tier = tierForNight(night, today);
	if (tier === 'DONE') return null;
	if (tier === 'C') return today;
	return addDays((night as Extract<Night, { kind: 'standing' }>).lastConfirmed!, DUE_AFTER[tier]);
}

const URGENCY: Record<VenueTier, number> = { C: 0, B: 1, A: 2 };

/**
 * A venue is as urgent as its most urgent night: one call covers every night
 * there, so a venue with any never-confirmed night is C, and that call
 * refreshes the rest. Null when there is nothing to call about — no nights at
 * all (that's discovery, not a tier), or only finished one-offs.
 */
export function tierForVenue(nights: Night[], today: string): VenueTier | null {
	const tiers = nights.map((n) => tierForNight(n, today)).filter((t): t is VenueTier => t !== 'DONE');
	return tiers.length ? tiers.reduce((a, b) => (URGENCY[b] < URGENCY[a] ? b : a)) : null;
}

/** Due when its most urgent night is due (the earliest, if several share that tier). */
export function dueDateForVenue(nights: Night[], today: string): string | null {
	const tier = tierForVenue(nights, today);
	if (!tier) return null;
	return (
		nights
			.filter((n) => tierForNight(n, today) === tier)
			.map((n) => dueDateForNight(n, today)!)
			.sort()[0] ?? null
	);
}

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayMonth = (d: string) => `${Number(d.slice(8, 10))} ${MONTH[Number(d.slice(5, 7)) - 1]}`;
const monthYear = (d: string) => `${MONTH[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;

/**
 * What the system concluded about a venue and why, for the call screen — read
 * only. "Tier B · weekly — confirmed 2 Nov, running since not known".
 */
export function describeVenueTier(nights: Night[], today: string): { tier: VenueTier | null; text: string } {
	const tier = tierForVenue(nights, today);
	if (!tier) return { tier, text: 'No tier — no night on file to call about' };
	if (tier === 'C') return { tier, text: 'Tier C · this week — a night here has never been confirmed' };
	const due = dueDateForVenue(nights, today);
	const n = nights.find((x) => x.kind === 'standing' && tierForNight(x, today) === tier && dueDateForNight(x, today) === due) as Extract<Night, { kind: 'standing' }>;
	const held = n.runningSince ? `running since ${monthYear(n.runningSince)}` : 'running since not known';
	const ours = tier === 'A' && !(n.runningSince && n.runningSince <= monthsBefore(today, HELD_MONTHS)) && n.firstConfirmedAt ? ` · first confirmed ${dayMonth(n.firstConfirmedAt)} ${n.firstConfirmedAt.slice(0, 4)}` : '';
	return { tier, text: `Tier ${tier} · ${tier === 'A' ? 'monthly' : 'weekly'} — confirmed ${dayMonth(n.lastConfirmed!)}, ${held}${ours}` };
}
