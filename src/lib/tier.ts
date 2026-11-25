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
// A night whose act changes every week (Residency.rotatingAct) is never A:
// the protocol puts "venues that rotate line-ups" in tier B. The schedule is
// stable; the lineup is not, and it's the lineup that changes weekly.
//
// Pure functions, no database: dates are YYYY-MM-DD in Kampala's calendar.

import { addDays, daysBetween } from './build/week.js';

export type NightTier = 'A' | 'B' | 'C' | 'DONE';
export type VenueTier = 'A' | 'B' | 'C';

export type Night =
	| {
			kind: 'standing';
			lastConfirmed: string | null; //    our last confirmation of the rule
			runningSince: string | null; //     the venue's claim; null = not asked
			firstConfirmedAt?: string | null; // our first confirmation; set once
			rotating?: boolean; //             a different act every week: B at best
			period?: number; //                days between its nights: 7, 14 fortnightly, 35 monthly
	  }
	| {
			kind: 'one-off';
			date: string;
			confirmed: boolean; // status CONFIRMED
	  };

export const HELD_MONTHS = 3;
export const DUE_AFTER: Record<'A' | 'B', number> = { A: 30, B: 7 };

/**
 * How long a confirmation stays a fact, by tier — derived, like the tier, never
 * a stored constant. A: a standing situation, the monthly sweep plus slack. B:
 * new or rotating, so its line-up moves — confirmed five weeks ago is a memory.
 * C has no window: never confirmed, it isn't publishable at any age. (One-offs
 * are confirmed or not; elapsed time doesn't enter.) Each is due a call before
 * it goes stale: DUE_AFTER < FRESH_DAYS.
 *
 * And never shorter than the night's own period: max(tier window, period). Tier
 * is volatility, period is frequency — a monthly tier B night holds 35 days, or
 * it could never publish at all.
 */
export const FRESH_DAYS: Record<'A' | 'B', number> = { A: 45, B: 10 };

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
 *   …unless its act rotates                          → B, however long held
 *     held = running since 3+ months ago (their word)
 *         OR first confirmed by us 3+ months ago (our record)
 */
export function tierForNight(night: Night, today: string): NightTier {
	if (night.kind === 'one-off') return night.confirmed || night.date < today ? 'DONE' : 'C';
	if (!night.lastConfirmed) return 'C';
	const since = monthsBefore(today, HELD_MONTHS);
	const held = (night.runningSince != null && night.runningSince <= since) || (night.firstConfirmedAt != null && night.firstConfirmedAt <= since);
	return held && !night.rotating ? 'A' : 'B';
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
	const held = n.rotating ? 'a different act every week' : n.runningSince ? `running since ${monthYear(n.runningSince)}` : 'running since not known';
	const ours = tier === 'A' && !(n.runningSince && n.runningSince <= monthsBefore(today, HELD_MONTHS)) && n.firstConfirmedAt ? ` · first confirmed ${dayMonth(n.firstConfirmedAt)} ${n.firstConfirmedAt.slice(0, 4)}` : '';
	return { tier, text: `Tier ${tier} · ${tier === 'A' ? 'monthly' : 'weekly'} — confirmed ${dayMonth(n.lastConfirmed!)}, ${held}${ours}` };
}

type Standing = Extract<Night, { kind: 'standing' }>;

/** Whether a standing night's confirmation still holds on `asOf`, by its own tier's window. */
export function freshOn(night: Standing, asOf: string): boolean {
	const tier = tierForNight(night, asOf);
	if (tier === 'C' || tier === 'DONE' || !night.lastConfirmed) return false;
	return daysBetween(night.lastConfirmed, asOf) <= windowFor(tier, night);
}

/**
 * What a night's tier rests on. Tier A needs the night HELD 3+ months: by our
 * own first confirmation (our record), or only by the venue's "running since"
 * (their word). A tier held on their word inherits that weaker footing, and the
 * window it buys (45 days, not 10) decides what publishes — so it is counted.
 * Anything not A rests on our confirmations alone.
 */
export function tierBasis(night: Standing, asOf: string): 'record' | 'word' {
	if (tierForNight(night, asOf) !== 'A') return 'record';
	const since = monthsBefore(asOf, HELD_MONTHS);
	return night.firstConfirmedAt != null && night.firstConfirmedAt <= since ? 'record' : 'word';
}

const windowFor = (tier: 'A' | 'B', night: Standing) => Math.max(FRESH_DAYS[tier], night.period ?? 7);

/** The window a night will be held to once confirmed — C is confirmed into B at best. */
const windowOf = (night: Standing, asOf: string) =>
	windowFor(tierForNight({ ...night, lastConfirmed: night.lastConfirmed ?? asOf }, asOf) === 'A' ? 'A' : 'B', night);

export interface HealthNight extends Standing {
	venue: string;
	eventName: string;
	startTime: string | null;
	register: string | null;
}

export interface RegisterHealth {
	total: number;
	publishable: number; //   fresh by its tier's window, with a time and a register
	never: number;
	thisWeek: number; //      confirmations Monday to today
	needed: number; //        confirmations a week to keep the whole book fresh — derived, not set
	last30: number;
	oldestLapsed: { venue: string; eventName: string; lastConfirmed: string } | null;
	heldOnRecord: number; //  of the publishable: tier resting on our own confirmations
	heldOnWord: number; //    of the publishable: tier A only on the venue's "running since"
	red: boolean; //          publishable under half the book
}

/**
 * The counter that was missing: how much of the book can publish today, and
 * whether confirmations are coming in fast enough to keep it so. The weekly
 * need is each night's share of a week — 7 days over its window — summed, so
 * it moves with the size and the make-up of the book.
 */
export function registerHealth(nights: HealthNight[], today: string): RegisterHealth {
	const monday = addDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
	const confirmed = nights.filter((n) => n.lastConfirmed);
	const lapsed = confirmed.filter((n) => !freshOn(n, today)).sort((a, b) => a.lastConfirmed!.localeCompare(b.lastConfirmed!));
	const live = nights.filter((n) => freshOn(n, today) && n.startTime && n.register);
	const publishable = live.length;
	return {
		total: nights.length,
		publishable,
		never: nights.length - confirmed.length,
		thisWeek: confirmed.filter((n) => n.lastConfirmed! >= monday && n.lastConfirmed! <= today).length,
		// Rounded before the ceiling: ten nights at 7/10 sum to 7.000000000000001, which is 7, not 8.
		needed: Math.ceil(Number(nights.reduce((sum, n) => sum + 7 / windowOf(n, today), 0).toFixed(6))),
		last30: confirmed.filter((n) => n.lastConfirmed! > addDays(today, -30)).length,
		oldestLapsed: lapsed[0] ? { venue: lapsed[0].venue, eventName: lapsed[0].eventName, lastConfirmed: lapsed[0].lastConfirmed! } : null,
		heldOnRecord: live.filter((n) => tierBasis(n, today) === 'record').length,
		heldOnWord: live.filter((n) => tierBasis(n, today) === 'word').length,
		red: publishable < nights.length / 2
	};
}
