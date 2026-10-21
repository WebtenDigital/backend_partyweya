// "Add to the register": the answers that decide which table a row lands in,
// and what its provenance lets PartyWeya claim. Shared by the form's live
// preview and the server action so the two can't disagree.

import { addDays } from './week.js';

export type Repeat = 'weekly' | 'once' | 'override' | 'cancelled';

export const REPEATS: { key: Repeat; label: (day: string) => string; writes: string }[] = [
	{ key: 'weekly', label: (d) => `It’s every ${d}`, writes: 'RESIDENCY' },
	{ key: 'once', label: () => 'Just this once', writes: 'OCCURRENCE' },
	{ key: 'override', label: (d) => `Instead of the usual ${d}`, writes: 'OCCURRENCE · OVERRIDE' },
	{ key: 'cancelled', label: () => 'It’s off this week', writes: 'OCCURRENCE · CANCELLED' }
];

export type Provenance = 'venue' | 'promoter' | 'act' | 'listing' | 'suggested' | 'attended';

/** What each answer to "where did this come from?" writes. No default, on purpose. */
export const PROVENANCE: {
	key: Provenance;
	label: string;
	effect: string;
	confirms: boolean; // confirmed (publishable once timed) vs stays a LEAD
	sources: { key: string; label: string }[]; // the Source enum values this can mean
}[] = [
	{ key: 'venue', label: 'The venue told me', effect: 'FACTUAL · confirmed', confirms: true,
		sources: [{ key: 'OWNER', label: 'the owner' }, { key: 'MANAGER', label: 'a manager' }] },
	{ key: 'promoter', label: 'A promoter or agent told me', effect: 'FACTUAL · confirmed', confirms: true,
		sources: [{ key: 'PROMOTER', label: 'the promoter' }, { key: 'AGENT', label: 'an agent' }] },
	// The performer, about their own booking: a principal, so confirmed — though they
	// rarely know the door time, so it often lands as "blocks this week" for a venue call.
	{ key: 'act', label: 'The act told me', effect: 'FACTUAL · confirmed · time often unknown', confirms: true,
		sources: [{ key: 'ACT', label: 'the act themselves' }] },
	{ key: 'listing', label: 'I saw a listing or a flyer', effect: 'FACTUAL · stays a LEAD', confirms: false,
		sources: [{ key: 'TICKETING', label: 'a ticketing listing' }, { key: 'SOCIAL_MEDIA', label: 'their social post' }, { key: 'FLYER', label: 'a flyer or poster' }, { key: 'PRESS', label: 'the press' }] },
	{ key: 'suggested', label: 'Someone suggested it', effect: 'no claim · needs a call', confirms: false,
		sources: [{ key: 'AUDIENCE', label: 'a reader' }] },
	{ key: 'attended', label: 'I was there', effect: 'VETTED · confirmed · logs attendance', confirms: true,
		sources: [{ key: 'ATTENDED', label: 'attendance' }] }
];

export const DAYS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** ISO weekday, 1 = Monday … 7 = Sunday. */
export const isoDay = (date: string) => ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

/** The Monday of the week a date sits in. */
export const mondayOf = (date: string) => addDays(date, 1 - isoDay(date));

/** The next date (from today, inclusive) that falls on an ISO weekday. */
export const nextOn = (today: string, day: number) => addDays(today, (day - isoDay(today) + 7) % 7);
