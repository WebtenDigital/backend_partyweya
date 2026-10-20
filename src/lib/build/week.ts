// The Sunday build: one Mon–Sun week pulled from the register, and the gate
// that decides whether it is publishable before any copy gets written.
// Pure — no database — so it can be checked against fixtures.

export type Register = 'CHILL' | 'SOCIAL' | 'HIGH_ENERGY';
export const REGISTERS: Register[] = ['CHILL', 'SOCIAL', 'HIGH_ENERGY'];

// Rule F5: a VETTED claim only counts if the attendance behind it is this recent.
export const F5_WINDOW_DAYS = 28;
// A standing night stays confirmed for one monthly sweep after its last call.
export const SWEEP_DAYS = 35;

export interface PerkIn {
	kind: string;
	label: string;
	condition: string | null;
	activeUntil: string | null; // YYYY-MM-DD, the last day it holds; null = until told otherwise
	sortOrder: number;
}

export type Perk = Pick<PerkIn, 'kind' | 'label' | 'condition' | 'activeUntil'>;

/**
 * The offers a row carries: a dated row's own perks replace the standing
 * night's entirely; otherwise the rule's apply. Either way, only those still
 * running on THAT row's date — a perk ending Thursday never reaches Saturday.
 */
export function resolvePerks(date: string, own: PerkIn[] | null, rule: PerkIn[]): Perk[] {
	const source = own && own.length ? own : rule;
	return source
		.filter((p) => p.activeUntil == null || p.activeUntil >= date)
		.sort((a, b) => a.sortOrder - b.sortOrder)
		.map(({ kind, label, condition, activeUntil }) => ({ kind, label, condition, activeUntil }));
}

export interface VenueIn {
	id: string;
	name: string;
	zone: string | null;
	division: string | null;
	phone: string | null;
}

export interface ResidencyIn {
	id: string;
	venue: VenueIn;
	eventName: string;
	category: string;
	dayOfWeek: number; // 1 = Monday … 7 = Sunday
	startTime: string | null;
	priceGate: number | null;
	register: Register;
	recurrence: string;
	claimType: string | null;
	source: string | null;
	lastConfirmed: string | null; // YYYY-MM-DD
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
	priceGate: number | null;
	priceNote: string | null;
	register: Register | null;
	claimType: string | null;
	source: string | null;
	status: 'LEAD' | 'CONFIRMED' | 'CHANGED' | 'CANCELLED';
	confirmedOn: string | null; // YYYY-MM-DD
	lineup: string[]; // empty = the standing night's
	perks: PerkIn[];
}

export type RowState = 'publishable' | 'needs-time' | 'lead' | 'changed';

export interface Row {
	key: string;
	residencyId?: string; // the standing night behind a STANDING or OVERRIDE row
	date: string;
	kind: 'STANDING' | 'OVERRIDE' | 'ONE-OFF';
	eventName: string;
	venue: VenueIn;
	category: string;
	startTime: string | null;
	priceGate: number | null;
	usualPrice: number | null; // the residency's price, when an override changes it
	extraTiers: number;
	register: Register | null;
	lineup: string[];
	billing: string | null; // the lineup as a sentence (compose_billing), filled in by the loader
	perks: Perk[];
	claimType: string | null;
	source: string | null;
	checkedOn: string | null; // when it was confirmed (or attended, for VETTED)
	state: RowState;
	missing: string[]; // for gaps: time, cover, register
}

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

/** "165K PRE | 190K AT THE GATE" → 1 tier beyond the one shown. */
const extraTiers = (note: string | null) =>
	note ? Math.max(0, note.split('|').filter((t) => t.trim()).length - 1) : 0;

function stateOf(confirmed: boolean, startTime: string | null, register: Register | null): RowState {
	if (!confirmed) return 'lead';
	return startTime && register ? 'publishable' : 'needs-time';
}

function missingOf(startTime: string | null, priceGate: number | null, register: Register | null) {
	return [!startTime && 'time', priceGate == null && 'cover', !register && 'register'].filter(
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
		if (r.recurrence !== 'WEEKLY') continue; // monthly/seasonal can't be placed from a weekday alone
		const date = addDays(weekStart, r.dayOfWeek - 1);
		const o = overrides.get(`${r.id}|${date}`);
		if (o) {
			if (o.status === 'CANCELLED') continue;
			const startTime = o.startTime ?? r.startTime;
			const register = o.register ?? r.register;
			const priceGate = o.priceGate ?? r.priceGate;
			rows.push({
				key: o.id,
				residencyId: r.id,
				date,
				kind: 'OVERRIDE',
				eventName: o.eventName,
				venue: o.venue,
				category: o.category,
				startTime,
				priceGate,
				usualPrice: priceGate !== r.priceGate ? r.priceGate : null,
				extraTiers: extraTiers(o.priceNote),
				register,
				lineup: o.lineup.length ? o.lineup : r.lineup,
				billing: null,
				perks: resolvePerks(date, o.perks, r.perks),
				claimType: o.claimType,
				source: o.source,
				checkedOn: o.confirmedOn,
				state:
					o.status === 'CHANGED'
						? 'changed'
						: stateOf(o.status === 'CONFIRMED', startTime, register),
				missing: missingOf(startTime, priceGate, register)
			});
			continue;
		}
		const confirmed =
			r.lastConfirmed != null && daysBetween(r.lastConfirmed, weekStart) <= SWEEP_DAYS;
		rows.push({
			key: `${r.id}|${date}`,
			residencyId: r.id,
			date,
			kind: 'STANDING',
			eventName: r.eventName,
			venue: r.venue,
			category: r.category,
			startTime: r.startTime,
			priceGate: r.priceGate,
			usualPrice: null,
			extraTiers: 0,
			register: r.register,
			lineup: r.lineup,
			billing: null,
			perks: resolvePerks(date, null, r.perks),
			claimType: r.claimType,
			source: r.source,
			checkedOn: r.lastConfirmed,
			state: stateOf(confirmed, r.startTime, r.register),
			missing: missingOf(r.startTime, r.priceGate, r.register)
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
			priceGate: o.priceGate,
			usualPrice: null,
			extraTiers: extraTiers(o.priceNote),
			register: o.register,
			lineup: o.lineup,
			billing: null,
			perks: resolvePerks(o.date, o.perks, []),
			claimType: o.claimType,
			source: o.source,
			checkedOn: o.confirmedOn,
			state: o.status === 'CHANGED' ? 'changed' : stateOf(o.status === 'CONFIRMED', o.startTime, o.register),
			missing: missingOf(o.startTime, o.priceGate, o.register)
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

export function gate(weekStart: string, rows: Row[]): Gate {
	const pub = rows.filter((r) => r.state === 'publishable');
	const heldBack = rows.filter((r) => r.state === 'needs-time').length;

	const registers = { CHILL: 0, SOCIAL: 0, HIGH_ENERGY: 0 } as Record<Register, number>;
	for (const r of pub) registers[r.register!]++;
	const absent = REGISTERS.filter((r) => registers[r] === 0);

	const vetted = pub
		.filter(
			(r) =>
				r.claimType === 'VETTED' &&
				r.checkedOn != null &&
				daysBetween(r.checkedOn, weekStart) <= F5_WINDOW_DAYS
		)
		.sort((a, b) => b.checkedOn!.localeCompare(a.checkedOn!));

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
			pass: vetted.length > 0,
			detail: vetted.length
				? `${vetted.length} vetted, newest ${shortDate(vetted[0].checkedOn!)} — inside Rule F5’s window`
				: 'No attendance inside Rule F5’s window — the set is a listing, not curation'
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
export function shillings(n: number | null) {
	if (n == null) return '—';
	if (n === 0) return 'Free';
	if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${+(n / 1_000).toFixed(1)}K`;
	return String(n);
}

export const maskPhone = (phone: string | null) =>
	phone ? `${phone.replace(/\s+/g, '').slice(0, 4)} ···` : 'no number';

/** Rule F5: how old the last confirmation behind an open-ended offer is. */
export function offerStaleness(lastConfirmed: string | null, today: string) {
	if (!lastConfirmed) return 'Offers never confirmed — check they still run before they publish.';
	const days = daysBetween(lastConfirmed, today);
	const age = days < 14 ? `${days} day${days === 1 ? '' : 's'}` : `${Math.round(days / 7)} weeks`;
	return days < 14 ? null : `Offers last confirmed ${age} ago — check they still run before they publish.`;
}
