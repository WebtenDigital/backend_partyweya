// The Thursday call round: who to ring, grouped by what blocks soonest.
// One row per venue, in its most urgent group, carrying every reason it's
// there — a venue gets one call that covers all of them.

import { SWEEP_DAYS, daysBetween, shortDate } from './week.js';

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
}

export interface QueueResidency {
	id: string;
	venueId: string;
	eventName: string;
	category: string;
	dayOfWeek: number;
	startTime: string | null;
	lastConfirmed: string | null;
}

export interface QueueOccurrence {
	id: string;
	venueId: string;
	date: string;
	eventName: string;
	startTime: string | null;
	priceGate: number | null;
	register: string | null;
	status: string;
}

export interface QueueItem {
	text: string;
	href: string; // query string for the call screen: ?occurrence= / ?residency=
}

export interface QueueRow {
	venue: QueueVenue;
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
	occurrences: QueueOccurrence[] // non-cancelled, from today to the end of the build week
): QueueRow[] {
	const byId = new Map(venues.map((v) => [v.id, v]));
	const rows = new Map<string, QueueRow>();
	const rank: Record<GroupKey, number> = { 'this-week': 0, 'every-week': 1, sweep: 2, unclassified: 3 };

	const add = (venueId: string, group: GroupKey, item: QueueItem) => {
		const venue = byId.get(venueId);
		if (!venue) return;
		const row = rows.get(venueId) ?? { venue, group, items: [], askQ6: !venue.conversationTest };
		if (rank[group] < rank[row.group]) row.group = group;
		row.items.push(item);
		rows.set(venueId, row);
	};

	for (const o of occurrences) {
		const why = blockers(o);
		if (why) add(o.venueId, 'this-week', { text: `${o.eventName} · ${why} · ${dayLabel(o.date)}`, href: `?occurrence=${o.id}` });
	}
	for (const r of residencies) {
		if (!r.startTime) {
			add(r.venueId, 'every-week', { text: `${r.eventName} · no start time · ${DOW[r.dayOfWeek]}`, href: `?residency=${r.id}` });
		} else if (!r.lastConfirmed || daysBetween(r.lastConfirmed, weekStart) > SWEEP_DAYS) {
			const when = r.lastConfirmed ? `last confirmed ${shortDate(r.lastConfirmed)}` : 'never confirmed';
			add(r.venueId, 'sweep', { text: `${r.eventName} · ${when}`, href: `?residency=${r.id}` });
		}
	}
	// Venues already in the book for a standing night but never asked question 6.
	for (const r of residencies) {
		const v = byId.get(r.venueId);
		if (v && !v.conversationTest && !rows.has(v.id)) {
			add(v.id, 'unclassified', { text: `register guessed from ${r.category.replaceAll('_', ' ')}`, href: `?residency=${r.id}` });
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
