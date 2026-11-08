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

// ── VOUCHES RUNNING OUT, under the Sunday Build's register balance ───────
// Not calls: a vouch is a judgement about a room, so the only fix is a visit.
// Never on the call round — a call confirms a night runs; it can't refresh a vouch.

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

/** The vouches running out in a build week: the evidence and the action, never the ranking. */
export function vouchRound(rows: Row[], week: string, today: string) {
	const seen = new Set<string>();
	const items: VouchItem[] = [];
	for (const r of rows) {
		const state = vouchState(r.attendedAt, week);
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
	return { items };
}

// ── WHERE FRIDAY'S ATTENDANCE GOES ──────────────────────────────────────
// Rule F4 as written: the attendance defaults to whichever mood is furthest
// below its floor, or has gone longest without a fresh entry. Count leads;
// freshness breaks ties. The one place this is decided.
//
// Live vouches are NOT in it. They decide whether the Sunday gate passes, not
// which register is starving: ranked on vouches, three registers at zero live
// would tie and send the week's one attendance to the loudest mood in it.

export interface RegisterNeed {
	register: Register;
	count: number; //                publishable entries this week — the bars, and the gate's count
	lastAttended: string | null; //  the latest attendedAt among the register's nights this week
	daysSince: number | null; //     null = never attended: sorts worst
}

export type NeedReason = 'absent' | 'fewest' | 'stale';

export function attendanceTarget(rows: Row[], today: string) {
	const registers: RegisterNeed[] = REGISTERS.map((register) => {
		const lastAttended =
			rows
				.filter((r) => r.register === register && r.attendedAt)
				.map((r) => r.attendedAt!)
				.sort()
				.at(-1) ?? null;
		return {
			register,
			count: rows.filter((r) => r.state === 'publishable' && r.register === register).length,
			lastAttended,
			daysSince: lastAttended ? daysBetween(lastAttended, today) : null
		};
	});
	const since = (n: RegisterNeed) => n.daysSince ?? Infinity;
	// 1. none at all (the gate fails on mood balance)  2. fewest  3. longest since a fresh entry
	const ranked = [...registers].sort((a, b) => a.count - b.count || (since(a) === since(b) ? 0 : since(a) > since(b) ? -1 : 1));
	const [first, second] = ranked;
	const reason: NeedReason = first.count === 0 ? 'absent' : second.count === first.count ? 'stale' : 'fewest';
	return { registers, ranked, target: first.register, reason };
}

const ago = (n: RegisterNeed) => (n.daysSince == null ? 'never attended' : `last attended ${n.daysSince === 1 ? 'yesterday' : `${n.daysSince} days ago`}`);
const nights = (n: number) => `${n} night${n === 1 ? '' : 's'}`;

/** The verdict, naming the register and the reason. */
export function attendanceVerdict({ ranked, target, reason }: ReturnType<typeof attendanceTarget>) {
	const [first, second] = ranked;
	const go = `Point Friday’s attendance at ${LABEL[target]}.`;
	if (reason === 'absent')
		return `No ${LABEL[target]} entries this week — the gate fails on mood balance (Rule F4) until there is one. That is a gate failure, not a preference. ${go}`;
	if (reason === 'stale')
		return `${LABEL[first.register]} and ${LABEL[second.register]} tie on ${nights(first.count)}; ${LABEL[target]} has gone longer without a fresh entry — ${ago(first)}. ${go}`;
	return `${LABEL[target]} is thinnest — ${nights(first.count)}, ${ago(first)}. ${go}`;
}
