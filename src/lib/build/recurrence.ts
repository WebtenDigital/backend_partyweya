// Whether a standing night runs on a given date of its weekday. A rule with a
// longer period is still a rule: weekly every week; fortnightly when the weeks
// since a date it actually ran are even; monthly when the date is the right
// one of its month ("the last Friday"). And when a rule can't be placed — no
// anchor, no pattern, a season — the night is HELD with the reason, never
// silently listed and never silently dropped: a band listed on a night it
// isn't playing is the worst error a listing can make.
//
// Pure, dates as YYYY-MM-DD.

import { addDays, daysBetween } from './week.js';

/** How often each rule comes round, in days. 35 for monthly: two "last Fridays" can be five weeks apart. */
export const PERIOD_DAYS: Record<string, number> = { WEEKLY: 7, FORTNIGHTLY: 14, MONTHLY: 35 };
export const periodOf = (recurrence: string | null | undefined) => PERIOD_DAYS[recurrence ?? 'WEEKLY'] ?? 7;

export const ORDINALS = ['FIRST', 'SECOND', 'THIRD', 'FOURTH', 'LAST'] as const;
export type Ordinal = (typeof ORDINALS)[number];

export interface Rule {
	recurrence: string;
	anchorDate?: string | null; //      fortnightly: any date it actually ran
	monthlyOrdinal?: string | null; // monthly: which of the month's weekdays
}

export type Placement = { on: true } | { on: false } | { held: string };

const mondayOf = (date: string) => addDays(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7));
const month = (date: string) => date.slice(0, 7);

/** Which of its month's same weekdays `date` is: FIRST…FOURTH (a fifth is only ever LAST), and whether it's the LAST. */
export function ordinalsOf(date: string): Ordinal[] {
	const nth = Math.ceil(Number(date.slice(8, 10)) / 7);
	const last = month(addDays(date, 7)) !== month(date);
	return [...(nth <= 4 ? [ORDINALS[nth - 1]] : []), ...(last ? (['LAST'] as const) : [])];
}

/** Does the rule run on `date` (which already falls on its weekday)? */
export function placeOn(rule: Rule, date: string): Placement {
	switch (rule.recurrence) {
		case 'WEEKLY':
			return { on: true };
		case 'FORTNIGHTLY': {
			if (!rule.anchorDate) return { held: 'missing recurrence anchor' };
			const weeks = daysBetween(mondayOf(rule.anchorDate), mondayOf(date)) / 7;
			return { on: weeks % 2 === 0 };
		}
		case 'MONTHLY':
			if (!rule.monthlyOrdinal) return { held: 'missing monthly pattern' };
			return { on: ordinalsOf(date).includes(rule.monthlyOrdinal as Ordinal) };
		default:
			// SEASONAL, or anything else: no rule to place a date from.
			return { held: `${rule.recurrence.toLowerCase()} — no rule to place a date` };
	}
}
