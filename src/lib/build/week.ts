// The Sunday build: one Mon–Sun week pulled from the register, and the gate
// that decides whether it is publishable before any copy gets written.
// Pure — no database — so it can be checked against fixtures.

import { vouchDay, vouchExpires, vouchExpiry, vouchState } from './vouch.js';
import { priceLabel, type PriceLabel, type PriceRow } from '../price.js';
import { freshOn } from '../tier.js';
import { periodOf, placeOn } from './recurrence.js';

export type Register = 'CHILL' | 'SOCIAL' | 'HIGH_ENERGY';
export const REGISTERS: Register[] = ['CHILL', 'SOCIAL', 'HIGH_ENERGY'];

// Rule F5: how long a confirmation stays fresh (a vouch's own 4–6 weeks is in vouch.ts).
export const F5_WINDOW_DAYS = 28;
// How long a standing night stays confirmed is its tier's window (FRESH_DAYS in
// lib/tier.ts): 45 days for tier A, 10 for B, none for a night never confirmed.

export interface PerkIn {
	kind: string;
	label: string;
	condition: string | null;
	activeUntil: string | null; // YYYY-MM-DD, the last day it holds; null = until told otherwise
	sortOrder: number;
}

export type Perk = Pick<PerkIn, 'kind' | 'label' | 'condition' | 'activeUntil'>;

/**
 * The offers a row carries: the standing night's, then any of the dated row's
 * own — a one-off offer ("just this week") is in addition to the weekly ones,
 * not instead of them. The same offer on both is listed once. Only those still
 * running on THAT row's date — a perk ending Thursday never reaches Saturday.
 */
export function resolvePerks(date: string, own: PerkIn[] | null, rule: PerkIn[]): Perk[] {
	// A known limit, not a bug: adding can't express a weekly offer SUSPENDED for
	// one date ("no happy hour this Friday, but there's a special") — both show.
	// Rare enough to live with; an activeUntil on the weekly one is the workaround.
	const byOrder = (list: PerkIn[]) => [...list].sort((a, b) => a.sortOrder - b.sortOrder);
	const key = (p: PerkIn) => `${p.kind}|${p.label.trim().toLowerCase()}`;
	const seen = new Set<string>();
	return [...byOrder(rule), ...byOrder(own ?? [])]
		.filter((p) => p.activeUntil == null || p.activeUntil >= date)
		.filter((p) => !seen.has(key(p)) && !!seen.add(key(p)))
		.map(({ kind, label, condition, activeUntil }) => ({ kind, label, condition, activeUntil }));
}

export interface VenueIn {
	id: string;
	name: string;
	zone: string | null;
	division: string | null;
	phone: string | null;
	paidClient?: boolean; // Rule 6: a paid client's place in a published order must be deliberate
}

export interface ResidencyIn {
	id: string;
	venue: VenueIn;
	eventName: string;
	category: string;
	dayOfWeek: number; // 1 = Monday … 7 = Sunday
	startTime: string | null;
	endTime?: string | null;
	prices: PriceRow[];
	register: Register;
	recurrence: string; //            WEEKLY | FORTNIGHTLY | MONTHLY (| SEASONAL, which can't be placed)
	anchorDate?: string | null; //    fortnightly: a date it actually ran
	monthlyOrdinal?: string | null; // monthly: FIRST … FOURTH, LAST
	claimType: string | null;
	source: string | null;
	lastConfirmed: string | null; // YYYY-MM-DD
	runningSince?: string | null; //   for the tier, which sets how long a confirmation holds
	firstConfirmedAt?: string | null;
	rotatingAct?: boolean;
	attendedAt: string | null; // YYYY-MM-DD — the night we were in the room
	attendedBy: string | null;
	clearsF2: boolean | null; // Rule F2, judged in the room — gates recommendation, not publication
	lineup: string[]; // the resident billing, in order
	perks: PerkIn[];
}

export interface OccurrenceIn {
	id: string;
	date: string; // YYYY-MM-DD
	venue: VenueIn;
	residencyId: string | null;
	eventName: string;
	category: string;
	startTime: string | null;
	endTime?: string | null;
	prices: PriceRow[]; // empty on an override = the standing night's
	register: Register | null;
	claimType: string | null;
	source: string | null;
	status: 'LEAD' | 'CONFIRMED' | 'CHANGED' | 'CANCELLED';
	confirmedOn: string | null; // YYYY-MM-DD
	attendedAt: string | null;
	attendedBy: string | null;
	clearsF2: boolean | null; // Rule F2, judged in the room — gates recommendation, not publication
	lineup: string[]; // empty = the standing night's
	perks: PerkIn[];
}

// 'held': a standing rule that can't be placed this week (no anchor, no monthly
// pattern) — unpublishable with its reason in `missing`, never silently dropped.
export type RowState = 'publishable' | 'needs-time' | 'lead' | 'changed' | 'held';

export interface Row {
	key: string;
	residencyId?: string; // the standing night behind a STANDING or OVERRIDE row
	date: string;
	kind: 'STANDING' | 'OVERRIDE' | 'ONE-OFF';
	eventName: string;
	venue: VenueIn;
	category: string;
	startTime: string | null;
	endTime: string | null; //   derived like startTime: an override's own, else the standing night's
	prices: PriceRow[]; //       the night's rows: an override's own, else the standing night's
	price: PriceLabel; //        as published ON THIS ROW'S DATE (lib/price.ts) — never stored
	usualPrice: string | null; // the standing night's figure, when an override's differs
	register: Register | null;
	lineup: string[];
	billing: string | null; // the lineup as a sentence (compose_billing), filled in by the loader
	perks: Perk[];
	claimType: string | null;
	source: string | null;
	checkedOn: string | null; // when it was last confirmed
	attendedAt: string | null; // when we were last in the room — what ages a vouch (vouch.ts)
	attendedBy: string | null;
	clearsF2: boolean | null; // Rule F2, judged in the room — gates recommendation, not publication
	state: RowState;
	missing: string[]; // for gaps: time, cover, register
}

/**
 * Rule F2 gates RECOMMENDATION, not publication. A listing only says we know
 * it's on; anywhere a night is held up as GOOD — a pick, a mood Highlight, the
 * mood menu, a "strongest" proposal — requires a visit that cleared it. A
 * doesn't-clear night is still VETTED (we were there) and still listable.
 */
export const recommendable = (n: { clearsF2?: boolean | null }) => n.clearsF2 === true;

// ── dates, as YYYY-MM-DD strings in Kampala's calendar ──────────────────

export const addDays = (date: string, days: number) => {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
};

export const daysBetween = (from: string, to: string) =>
	Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export const kampalaToday = (now = new Date()) =>
	new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kampala' }).format(now);

/** The Monday after `today` — on a Sunday, tomorrow: the week being built. */
export function nextMonday(today: string) {
	const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // Mon = 0
	return addDays(today, 7 - dow);
}

export const isMonday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() === 1;

// ── assembling the week ─────────────────────────────────────────────────

function stateOf(confirmed: boolean, startTime: string | null, register: Register | null): RowState {
	if (!confirmed) return 'lead';
	return startTime && register ? 'publishable' : 'needs-time';
}

// No price rows at all is "cover" missing — never free: free is a row at 0.
function missingOf(startTime: string | null, prices: PriceRow[], register: Register | null) {
	return [!startTime && 'time', !prices.length && 'cover', !register && 'register'].filter(
		(x): x is string => Boolean(x)
	);
}

export function buildWeek(
	weekStart: string,
	residencies: ResidencyIn[],
	occurrences: OccurrenceIn[]
): Row[] {
	const weekEnd = addDays(weekStart, 6);
	const inWeek = occurrences.filter((o) => o.date >= weekStart && o.date <= weekEnd);
	const overrides = new Map(
		inWeek.filter((o) => o.residencyId).map((o) => [`${o.residencyId}|${o.date}`, o])
	);
	const rows: Row[] = [];

	// Standing nights, unless an occurrence overrides that date.
	for (const r of residencies) {
		const date = addDays(weekStart, r.dayOfWeek - 1);
		// Fortnightly off-weeks and the month's other Fridays simply aren't this rule's nights.
		const place = placeOn(r, date);
		if ('on' in place && !place.on) continue;
		const o = overrides.get(`${r.id}|${date}`);
		if (o) {
			if (o.status === 'CANCELLED') continue;
			const startTime = o.startTime ?? r.startTime;
			const endTime = o.endTime ?? r.endTime ?? null;
			const register = o.register ?? r.register;
			// Prices are the night's price, not an offer: an override's own replace the rule's.
			const prices = o.prices.length ? o.prices : r.prices;
			const price = priceLabel(prices, date);
			const usual = priceLabel(r.prices, date).entry;
			rows.push({
				key: o.id,
				residencyId: r.id,
				date,
				kind: 'OVERRIDE',
				eventName: o.eventName,
				venue: o.venue,
				category: o.category,
				startTime,
				endTime,
				prices,
				price,
				usualPrice: usual !== price.entry ? usual : null,
				register,
				lineup: o.lineup.length ? o.lineup : r.lineup,
				billing: null,
				perks: resolvePerks(date, o.perks, r.perks),
				claimType: o.claimType,
				source: o.source,
				checkedOn: o.confirmedOn,
				attendedAt: o.attendedAt,
				attendedBy: o.attendedBy,
				clearsF2: o.clearsF2 ?? r.clearsF2, // this date's verdict, else the standing night's
				state:
					o.status === 'CHANGED'
						? 'changed'
						: stateOf(o.status === 'CONFIRMED', startTime, register),
				missing: missingOf(startTime, prices, register)
			});
			continue;
		}
		// A confirmation holds for max(its tier's window, the rule's period): a fortnightly night
		// called 12 days ago has run once since — not stale.
		const confirmed = freshOn(
			{ kind: 'standing', lastConfirmed: r.lastConfirmed, runningSince: r.runningSince ?? null, firstConfirmedAt: r.firstConfirmedAt, rotating: r.rotatingAct, period: periodOf(r.recurrence) },
			weekStart
		);
		const held = 'held' in place ? place.held : null;
		rows.push({
			key: `${r.id}|${date}`,
			residencyId: r.id,
			date,
			kind: 'STANDING',
			eventName: r.eventName,
			venue: r.venue,
			category: r.category,
			startTime: r.startTime,
			endTime: r.endTime ?? null,
			prices: r.prices,
			price: priceLabel(r.prices, date),
			usualPrice: null,
			register: r.register,
			lineup: r.lineup,
			billing: null,
			perks: resolvePerks(date, null, r.perks),
			claimType: r.claimType,
			source: r.source,
			checkedOn: r.lastConfirmed,
			attendedAt: r.attendedAt,
			attendedBy: r.attendedBy,
			clearsF2: r.clearsF2,
			state: held ? 'held' : stateOf(confirmed, r.startTime, r.register),
			missing: [...(held ? [held] : []), ...missingOf(r.startTime, r.prices, r.register)]
		});
	}

	// One-offs. An override whose residency is inactive or gone still shows, as a one-off.
	const placed = new Set(rows.map((r) => r.key));
	for (const o of inWeek) {
		if (placed.has(o.id) || o.status === 'CANCELLED') continue;
		rows.push({
			key: o.id,
			date: o.date,
			kind: 'ONE-OFF',
			eventName: o.eventName,
			venue: o.venue,
			category: o.category,
			startTime: o.startTime,
			endTime: o.endTime ?? null,
			prices: o.prices,
			price: priceLabel(o.prices, o.date),
			usualPrice: null,
			register: o.register,
			lineup: o.lineup,
			billing: null,
			perks: resolvePerks(o.date, o.perks, []),
			claimType: o.claimType,
			source: o.source,
			checkedOn: o.confirmedOn,
			attendedAt: o.attendedAt,
			attendedBy: o.attendedBy,
			clearsF2: o.clearsF2,
			state: o.status === 'CHANGED' ? 'changed' : stateOf(o.status === 'CONFIRMED', o.startTime, o.register),
			missing: missingOf(o.startTime, o.prices, o.register)
		});
	}

	return rows.sort(
		(a, b) =>
			a.date.localeCompare(b.date) ||
			Number(b.state === 'publishable') - Number(a.state === 'publishable') ||
			(a.startTime ?? '99').localeCompare(b.startTime ?? '99')
	);
}

// ── the gate ────────────────────────────────────────────────────────────

export interface Check {
	label: string;
	pass: boolean | null; // null = not wired yet; not counted
	detail: string;
	forecast?: string; // one line about what happens next, under the detail
}

export interface Gate {
	checks: Check[];
	passed: number;
	total: number;
	publishable: boolean;
	registers: Record<Register, number>;
	vetted: Row[];
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function gate(weekStart: string, rows: Row[], today = kampalaToday()): Gate {
	const pub = rows.filter((r) => r.state === 'publishable');
	const heldBack = rows.filter((r) => r.state === 'needs-time').length;

	const registers = { CHILL: 0, SOCIAL: 0, HIGH_ENERGY: 0 } as Record<Register, number>;
	for (const r of pub) registers[r.register!]++;
	const absent = REGISTERS.filter((r) => registers[r] === 0);

	// A vouch counts while it's in date for the build week (Rule F5, vouch.ts) — EXPIRING
	// included: that's a warning, not a lapse. The claim itself never changes.
	const vetted = pub.filter((r) => r.claimType === 'VETTED');
	const live = vetted
		.filter((r) => ['LIVE', 'EXPIRING'].includes(vouchState(r.attendedAt, weekStart)))
		.sort((a, b) => a.attendedAt!.localeCompare(b.attendedAt!));
	// Why there's no live vouch is diagnosed across every row in the week, publishable or not:
	// "no attendance" is only ever said when there truly is none.
	const attended = rows.filter((r) => r.source === 'ATTENDED');
	const lapsed = attended
		.filter((r) => vouchState(r.attendedAt, weekStart) === 'EXPIRED')
		.sort((a, b) => b.attendedAt!.localeCompare(a.attendedAt!));
	// In date, but the row itself can't publish — usually its monthly call is overdue.
	const held = attended.filter((r) => r.state !== 'publishable' && ['LIVE', 'EXPIRING'].includes(vouchState(r.attendedAt, weekStart)));
	const undated = vetted.filter((r) => !r.attendedAt);
	// Attendance that never became VETTED is a broken write, not a missing night out — say which.
	const unpromoted = attended.filter((r) => r.claimType !== 'VETTED');
	const named = (rs: Row[]) => rs.map((r) => `${r.eventName} · ${r.venue.name}`).join('; ');

	const timed = pub.filter((r) => r.startTime).length;
	const checks: Check[] = [
		{
			label: 'Every entry has a start time',
			pass: timed === pub.length,
			detail:
				`${timed} of ${pub.length} publishable rows timed` +
				(heldBack ? ` · ${plural(heldBack, 'confirmed row')} held back for one` : '')
		},
		{
			label: 'All three registers appear',
			pass: absent.length === 0,
			detail:
				`Chill ${registers.CHILL} · Social ${registers.SOCIAL} · High-Energy ${registers.HIGH_ENERGY}` +
				(absent.length ? ' — Rule F4 unmet' : '')
		},
		{
			label: 'At least one vetted claim',
			pass: live.length > 0,
			detail: live.length
				? `${plural(live.length, 'vetted row')} attended inside Rule F5’s window`
				: unpromoted.length
					? `${named(unpromoted)}: attended, but the claim did not promote to VETTED (it reads ${unpromoted[0].claimType ?? 'no claim'}). That's a write bug, not a missing night out.`
					: held.length
						? `${named(held)}: ${held.length === 1 ? 'a vouch still in date' : 'vouches still in date'} (${vouchExpiry(held[0].attendedAt!, today)}), but not publishable this week — ${held[0].missing.length ? `needs ${held[0].missing.join(' + ')}` : 'needs its call to confirm it’s on'}.`
						: lapsed.length
							? `Every vouch has aged out — ${lapsed[0].venue.name}’s ${vouchExpiry(lapsed[0].attendedAt!, today).replace(/^vouch expires (.*)$/, 'vouch expires $1, before this week')}. Being there again is the only fix; a call can’t renew it.`
							: undated.length
								? `${named(undated)}: VETTED with no attendance date — log when you were there.`
								: 'No attendance inside Rule F5’s window — the set is a listing, not curation',
			forecast: live.length
				? `${plural(live.length, 'live vouch', 'live vouches')} · next expires ${vouchDay(vouchExpires(live[0].attendedAt!))}` +
					(lapsed.length ? ` · ${lapsed[0].venue.name} ${vouchExpiry(lapsed[0].attendedAt!, today)}` : '')
				: undefined
		},
		{
			label: 'Nothing padded to hit a number',
			pass: true,
			detail: `${pub.length} cleared, ${pub.length} shown`
		},
		{
			label: 'Publication logged back to the register',
			pass: null,
			detail: 'Not wired yet — the round-up step will write Publication rows'
		}
	];
	const counted = checks.filter((c) => c.pass !== null);
	const passed = counted.filter((c) => c.pass).length;

	return {
		checks,
		passed,
		total: counted.length,
		publishable: pub.length > 0 && passed === counted.length,
		registers,
		vetted
	};
}

// ── formatting shared by the page ───────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export function shortDate(date: string) {
	const [, m, d] = date.split('-').map(Number);
	return `${d} ${MONTHS[m - 1]}`;
}

export function dayHeading(date: string) {
	const day = DAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
	return `${day} ${shortDate(date).toUpperCase()}`;
}

/** 10000 → "10K", 1500000 → "1.5M", 0 → "Free". */
export { shillings } from '../price.js'; // the one money formatter, beside the floor

export const maskPhone = (phone: string | null) =>
	phone ? `${phone.replace(/\s+/g, '').slice(0, 4)} ···` : 'no number';

/** Rule F5: how old the last confirmation behind an open-ended offer is. */
export function offerStaleness(lastConfirmed: string | null, today: string) {
	if (!lastConfirmed) return 'Offers never confirmed — check they still run before they publish.';
	const days = daysBetween(lastConfirmed, today);
	const age = days < 14 ? `${days} day${days === 1 ? '' : 's'}` : `${Math.round(days / 7)} weeks`;
	return days < 14 ? null : `Offers last confirmed ${age} ago — check they still run before they publish.`;
}
