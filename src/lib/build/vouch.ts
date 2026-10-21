// Rule F5's recency clause for a vouch: an independent-discovery entry holds
// 4–6 weeks. A range, honoured as a warning at 4 weeks and a hard expiry at 6.
//
// Derived, never stored: the claim stays VETTED (source ATTENDED is how we
// know), and only its freshness ages. A stored claim that decayed on a clock
// would need a scheduled recompute — the drift claimFor() removed.
//
// Dates are YYYY-MM-DD in Kampala's calendar, and asOf is the BUILD WEEK's
// Monday, not today: a vouch expiring mid-week reads EXPIRING for that whole
// week, so the gate can't pass on Thursday on a claim stale by Saturday.

import { addDays, daysBetween, shortDate, type Register, type Row } from './week.js';

export const VOUCH_WARN_DAYS = 28;
export const VOUCH_EXPIRY_DAYS = 42;

export type VouchState = 'NONE' | 'LIVE' | 'EXPIRING' | 'EXPIRED';

export function vouchState(attendedAt: string | null, asOf: string): VouchState {
	if (!attendedAt) return 'NONE';
	if (attendedAt > addDays(asOf, -VOUCH_WARN_DAYS)) return 'LIVE';
	if (attendedAt > addDays(asOf, -VOUCH_EXPIRY_DAYS)) return 'EXPIRING';
	return 'EXPIRED';
}

/** The day the vouch lapses. */
export const vouchExpires = (attendedAt: string) => addDays(attendedAt, VOUCH_EXPIRY_DAYS);

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const vouchDay = (date: string) => `${WEEKDAY[new Date(`${date}T00:00:00Z`).getUTCDay()]} ${shortDate(date)}`;

/** "vouch expires Mon 30 Nov" / "expired 12 days ago" — said against today, not the build week. */
export function vouchExpiry(attendedAt: string, today: string) {
	const expires = vouchExpires(attendedAt);
	const ago = daysBetween(expires, today);
	if (ago <= 0) return `vouch expires ${vouchDay(expires)}`;
	return `expired ${ago === 1 ? 'yesterday' : `${ago} days ago`}`;
}

// ── VOUCHES RUNNING OUT, on the call round ──────────────────────────────
// Not calls: a vouch is a judgement about a room, so the only fix is a visit.

export interface VouchItem {
	ref: string; // the residency or occurrence vouched for
	record: string;
	eventName: string;
	venue: string;
	register: Register | null;
	date: string; // when it runs in the build week — the visit to plan
	attendedAt: string;
	attendedBy: string | null;
	state: 'EXPIRING' | 'EXPIRED';
	expiry: string;
}

const LABEL: Record<Register, string> = { CHILL: 'Chill', SOCIAL: 'Social', HIGH_ENERGY: 'High-Energy' };
const REGISTERS: Register[] = ['CHILL', 'SOCIAL', 'HIGH_ENERGY'];

const refOf = (r: Row) => (r.kind === 'STANDING' ? r.residencyId! : r.key);

export function vouchRound(rows: Row[], week: string, today: string) {
	const seen = new Set<string>();
	const items: VouchItem[] = [];
	const live = new Map<Register, Set<string>>(REGISTERS.map((g) => [g, new Set()]));
	for (const r of rows) {
		const state = vouchState(r.attendedAt, week);
		if (state === 'NONE') continue;
		if ((state === 'LIVE' || state === 'EXPIRING') && r.register) live.get(r.register)!.add(refOf(r));
		if ((state === 'EXPIRING' || state === 'EXPIRED') && !seen.has(refOf(r))) {
			seen.add(refOf(r));
			items.push({
				ref: refOf(r),
				record: r.kind === 'STANDING' ? `/residencies/${r.residencyId}` : `/occurrences/${r.key}`,
				eventName: r.eventName,
				venue: r.venue.name,
				register: r.register,
				date: r.date,
				attendedAt: r.attendedAt!,
				attendedBy: r.attendedBy,
				state,
				expiry: vouchExpiry(r.attendedAt!, today)
			});
		}
	}
	items.sort((a, b) => Number(b.state === 'EXPIRED') - Number(a.state === 'EXPIRED') || a.attendedAt.localeCompare(b.attendedAt));

	// Rule F4's reactive default: the next night out goes to the mood furthest behind.
	// Ties break toward the register with fewest entries in the week overall.
	const entries = (g: Register) => rows.filter((r) => r.register === g).length;
	const [next] = [...REGISTERS].sort((a, b) => live.get(a)!.size - live.get(b)!.size || entries(a) - entries(b));
	const count = live.get(next)!.size;
	const target =
		count === 0
			? `No live ${LABEL[next]} vouch. Your next night out should be ${LABEL[next]}.`
			: `Fewest live vouches: ${LABEL[next]} (${count}). Your next night out should be ${LABEL[next]}.`;
	return { items, target, next };
}
