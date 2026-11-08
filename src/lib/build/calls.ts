// The Thursday call round: who to ring, grouped by what blocks soonest.
// One row per venue, in its most urgent group, carrying every reason it's
// there — a venue gets one call that covers all of them.

import { addDays, shortDate } from './week.js';
import { callHref, whoToCall, type Who } from './who.js';

/** The queue screen's sort, remembered in a cookie the server reads on load. */
export const SORT_COOKIE = 'pw_queue_sort';

export type GroupKey = 'this-week' | 'every-week' | 'due' | 'sweep' | 'unclassified';

export const GROUPS: { key: GroupKey; label: string; hint: string }[] = [
	{ key: 'this-week', label: 'Before publishing', hint: 'a night here has never been confirmed' },
	{ key: 'every-week', label: 'Blocks every week', hint: 'a standing night with no time' },
	{ key: 'due', label: 'Cadence', hint: 'the interval has arrived' },
	{ key: 'sweep', label: 'Visited, not called', hint: 'being there confirms it ran, not that it’s on' },
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
	attendedAt: string | null;
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

/** A venue whose cadence says ring it by the end of the build week. */
/**
 * A venue whose derived tier has come due (src/lib/server/tier.ts) — computed
 * from its nights on every request, never read from a stored column.
 */
export interface QueueDue {
	venueId: string;
	tier: 'A' | 'B' | 'C';
	due: string; //                  when its most urgent night needed a call
	lastConfirmed: string | null; // that night's last confirmation
	standingC: boolean; //           a standing night never confirmed: it blocks every window
}

export interface QueueItem {
	text: string;
	href: string; // the call screen, dialling whoever the rule picked
	group: GroupKey;
	// What drives it, for the by-date sort: the night's date, the cadence's due
	// date, the day a sweep lapsed. Null when nothing dates it — never invented.
	date: string | null;
	tier?: 'A' | 'B' | 'C'; // a cadence item's derived tier (tier.ts)
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
	organisers: QueueOrganiser[] = [],
	due: QueueDue[] = [],
	// Standing nights in the window that the Sunday Build's own expansion (buildWeek)
	// reads as unconfirmed — so a weekly night counts, not only an Occurrence row.
	unconfirmed: { residencyId: string; date: string }[] = []
): QueueRow[] {
	const byId = new Map(venues.map((v) => [v.id, v]));
	const orgs = new Map(organisers.map((o) => [o.id, o]));
	const rows = new Map<string, QueueRow>();
	const rank: Record<GroupKey, number> = { 'this-week': 0, 'every-week': 1, due: 2, sweep: 3, unclassified: 4 };

	const byResidency = new Map(residencies.map((r) => [r.id, r]));

	const add = (venueId: string, group: GroupKey, text: string, ref: string, who: Who, date: string | null, tier?: QueueItem['tier']) => {
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
		row.items.push({ text, href: callHref(organiser || booking ? who : { kind: 'VENUE' }, venueId, ref), group, date, ...(tier && { tier }) });
		rows.set(key, row);
	};

	for (const o of occurrences) {
		const why = blockers(o);
		if (why) add(o.venueId, 'this-week', `${o.eventName} · ${why} · ${dayLabel(o.date)}`, o.id, whoToCall(o, o.residencyId ? byResidency.get(o.residencyId) : null), o.date);
	}
	const blocking = new Set(unconfirmed.map((u) => u.residencyId));
	for (const u of unconfirmed) {
		const r = byResidency.get(u.residencyId);
		if (!r) continue;
		const when = r.lastConfirmed ? `last confirmed ${shortDate(r.lastConfirmed)}` : 'never confirmed';
		add(r.venueId, 'this-week', `${r.eventName} · not confirmed for ${dayLabel(u.date)}${r.startTime ? '' : ' · no start time'} · ${when}`, r.id, whoToCall(null, r), u.date);
	}
	for (const r of residencies) {
		const who = whoToCall(null, r);
		if (blocking.has(r.id)) continue; // already before publishing: one call covers it
		if (!r.startTime) {
			add(r.venueId, 'every-week', `${r.eventName} · no start time · ${DOW[r.dayOfWeek]}`, r.id, who, addDays(weekStart, r.dayOfWeek - 1));
		} else if (r.attendedAt && r.lastConfirmed && r.lastConfirmed <= r.attendedAt) {
			// Being there confirms it ran, not that next week is on — only a call does. A night
			// whose latest confirmation is the visit itself stays on the round until someone calls.
			add(r.venueId, 'sweep', `${r.eventName} · attended ${shortDate(r.attendedAt)}, not called since`, r.id, who, null);
		}
	}
	// The derived cadence. Tier A (confirmed, held 3+ months) is the monthly sweep;
	// B and C are this week's checks. A C venue already before publishing needs no
	// second line: that call covers every night there.
	for (const d of due) {
		if (d.tier === 'C') {
			// Before publishing: a standing night never confirmed blocks every window, so it
			// counts whatever its weekday. A one-off only counts inside the window — and
			// those are already listed from the dated rows above. One line per venue.
			if (d.standingC && rows.get(d.venueId)?.group !== 'this-week')
				add(d.venueId, 'this-week', 'Tier C · a standing night never confirmed', '', { kind: 'VENUE' }, d.due, 'C');
			continue;
		}
		// Cadence: A (confirmed, held 3+ months — the monthly sweep) and B (held under 3).
		const text =
			d.tier === 'A'
				? `Tier A · monthly · confirmed and held 3+ months · last confirmed ${shortDate(d.lastConfirmed!)}`
				: `Tier B · weekly · confirmed ${shortDate(d.lastConfirmed!)}, held under 3 months`;
		add(d.venueId, 'due', text, '', { kind: 'VENUE' }, d.due, d.tier);
	}
	// Venues already in the book for a standing night but never asked question 6.
	for (const r of residencies) {
		const v = byId.get(r.venueId);
		if (v && !v.conversationTest && !rows.has(v.id)) {
			add(v.id, 'unclassified', `register guessed from ${r.category.replaceAll('_', ' ')}`, r.id, { kind: 'VENUE' }, null);
		}
	}

	return [...rows.values()].sort(
		(a, b) => rank[a.group] - rank[b.group] || a.venue.name.localeCompare(b.venue.name)
	);
}

/** The date that drives a row: the soonest of its own group's items, or null. */
export function rowDate(row: QueueRow) {
	return row.items.filter((i) => i.group === row.group && i.date).map((i) => i.date!).sort()[0] ?? null;
}

/**
 * The badge: only what is blocking or overdue right now. Rows that stop this
 * week publishing, venues whose cadence fell due today or earlier, reminders
 * due today or overdue. Not the sweep, not anything due later this week, not
 * unclassified — a count that counted those would never reach zero, and would
 * stop being read. Not vouches either: they live on the Sunday Build, and a
 * badge on "This week" counts only what that screen holds.
 */
export function owedNow(queue: QueueRow[], reminders: { due: string | null }[], today: string) {
	const rows = queue.filter(
		// Tier A due is the monthly sweep: listed under cadence, never counted here.
		(r) => r.group === 'this-week' || r.group === 'every-week' || r.items.some((i) => i.group === 'due' && i.tier !== 'A' && i.date != null && i.date <= today)
	).length;
	return rows + reminders.filter((r) => r.due != null && r.due <= today).length;
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
