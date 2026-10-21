// The Thursday call round: who to ring, grouped by what blocks soonest.
// One row per venue, in its most urgent group, carrying every reason it's
// there — a venue gets one call that covers all of them.

import { SWEEP_DAYS, daysBetween, shortDate } from './week.js';
import { callHref, whoToCall, type Who } from './who.js';

export type GroupKey = 'this-week' | 'every-week' | 'sweep' | 'unclassified';

export const GROUPS: { key: GroupKey; label: string; hint: string }[] = [
	{ key: 'this-week', label: 'Blocks this week', hint: 'a dated row that cannot publish' },
	{ key: 'every-week', label: 'Blocks every week', hint: 'a standing night with no time' },
	{ key: 'sweep', label: 'Monthly sweep', hint: 'standing nights due their monthly call' },
	{ key: 'unclassified', label: 'Unclassified', hint: 'question 6 has never been asked' }
];

export interface QueueVenue {
	id: string;
	name: string;
	zone: string | null;
	phone: string | null;
	conversationTest: string | null;
	updatedAt?: string; // for the queue's inline phone save
}

export interface QueueOrganiser {
	id: string;
	name: string;
	contactName: string | null;
	phone: string | null;
	whatsapp: boolean;
}

export interface QueueResidency {
	id: string;
	venueId: string;
	organiserId: string | null;
	bookingPhone: string | null;
	bookingPhoneNote: string | null;
	eventName: string;
	category: string;
	dayOfWeek: number;
	startTime: string | null;
	lastConfirmed: string | null;
}

export interface QueueOccurrence {
	id: string;
	venueId: string;
	organiserId: string | null;
	residencyId: string | null;
	bookingPhone: string | null;
	bookingPhoneNote: string | null;
	date: string;
	eventName: string;
	startTime: string | null;
	priceGate: number | null;
	register: string | null;
	status: string;
}

export interface QueueItem {
	text: string;
	href: string; // the call screen, dialling whoever the rule picked
}

export interface QueueRow {
	key: string;
	venue: QueueVenue;
	// Who owns the fact: a promoter's night is asked of the promoter, not the venue —
	// a manager's “I think so?” would be recorded as confirmation.
	callWho: 'venue' | 'organiser' | 'unknown';
	organiser: QueueOrganiser | null;
	// A flyer's number nobody has attributed yet: callable, and labelled as such.
	booking: { phone: string; note: string | null } | null;
	group: GroupKey;
	items: QueueItem[];
	askQ6: boolean;
}

const DOW = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const dayLabel = (date: string) =>
	`${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(`${date}T00:00:00Z`).getUTCDay()]} ${shortDate(date)}`;

/** What stops a dated row publishing, or null if nothing does. */
function blockers(o: QueueOccurrence) {
	const parts = [
		o.status === 'LEAD' && 'unconfirmed',
		o.status === 'CHANGED' && 'changed — re-verify',
		!o.startTime && 'no time',
		o.priceGate == null && 'no price',
		!o.register && 'no register'
	].filter(Boolean);
	return parts.length ? parts.join(', ') : null;
}

export function callQueue(
	weekStart: string,
	venues: QueueVenue[],
	residencies: QueueResidency[],
	occurrences: QueueOccurrence[], // non-cancelled, from today to the end of the build week
	organisers: QueueOrganiser[] = []
): QueueRow[] {
	const byId = new Map(venues.map((v) => [v.id, v]));
	const orgs = new Map(organisers.map((o) => [o.id, o]));
	const rows = new Map<string, QueueRow>();
	const rank: Record<GroupKey, number> = { 'this-week': 0, 'every-week': 1, sweep: 2, unclassified: 3 };

	const byResidency = new Map(residencies.map((r) => [r.id, r]));

	const add = (venueId: string, group: GroupKey, text: string, ref: string, who: Who) => {
		const venue = byId.get(venueId);
		if (!venue) return;
		const organiser = who.kind === 'ORGANISER' ? (orgs.get(who.organiserId) ?? null) : null;
		const booking = who.kind === 'UNKNOWN' ? { phone: who.phone, note: who.note } : null;
		const key = organiser ? `${organiser.id}@${venueId}` : booking ? `booking:${booking.phone}@${venueId}` : venueId;
		const row = rows.get(key) ?? {
			key,
			venue,
			callWho: organiser ? ('organiser' as const) : booking ? ('unknown' as const) : ('venue' as const),
			organiser,
			booking,
			group,
			items: [],
			// Question 6 is about the room, so it's asked of the venue.
			askQ6: !organiser && !booking && !venue.conversationTest
		};
		if (rank[group] < rank[row.group]) row.group = group;
		row.items.push({ text, href: callHref(organiser || booking ? who : { kind: 'VENUE' }, venueId, ref) });
		rows.set(key, row);
	};

	for (const o of occurrences) {
		const why = blockers(o);
		if (why) add(o.venueId, 'this-week', `${o.eventName} · ${why} · ${dayLabel(o.date)}`, o.id, whoToCall(o, o.residencyId ? byResidency.get(o.residencyId) : null));
	}
	for (const r of residencies) {
		const who = whoToCall(null, r);
		if (!r.startTime) {
			add(r.venueId, 'every-week', `${r.eventName} · no start time · ${DOW[r.dayOfWeek]}`, r.id, who);
		} else if (!r.lastConfirmed || daysBetween(r.lastConfirmed, weekStart) > SWEEP_DAYS) {
			const when = r.lastConfirmed ? `last confirmed ${shortDate(r.lastConfirmed)}` : 'never confirmed';
			add(r.venueId, 'sweep', `${r.eventName} · ${when}`, r.id, who);
		}
	}
	// Venues already in the book for a standing night but never asked question 6.
	for (const r of residencies) {
		const v = byId.get(r.venueId);
		if (v && !v.conversationTest && !rows.has(v.id)) {
			add(v.id, 'unclassified', `register guessed from ${r.category.replaceAll('_', ' ')}`, r.id, { kind: 'VENUE' });
		}
	}

	return [...rows.values()].sort(
		(a, b) => rank[a.group] - rank[b.group] || a.venue.name.localeCompare(b.venue.name)
	);
}

/** Question 6, as people actually answer it. */
export const Q6 = [
	{ test: 'CAN_TALK', register: 'CHILL', answer: '“Yeah, it’s relaxed”' },
	{ test: 'ONLY_AT_THE_EDGES', register: 'SOCIAL', answer: '“Early on yes, later it gets going”' },
	{ test: 'NO', register: 'HIGH_ENERGY', answer: '“No chance, it’s loud”' }
] as const;

/** Next call, by cadence tier. */
export const CADENCE = [
	{ key: 'A', label: 'Tier A — monthly sweep', days: 28 },
	{ key: 'B', label: 'Tier B — fortnightly', days: 14 },
	{ key: 'C', label: 'Tier C — weekly', days: 7 }
] as const;
