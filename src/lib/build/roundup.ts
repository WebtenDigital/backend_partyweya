// The round-up brief: the week's publishable rows as copyable slide blocks,
// in the order decided by hand, plus the cover, caption and TikTok cut.
//
// What this never does: write the selling line. Every block carries facts
// from the register and an empty line typed by hand — that line is the
// comparative judgement Rule F2 protects, and a template would forge it.

import { addDays, dayHeading, shillings, shortDate, type Register, type Row } from './week.js';

export const REGISTERS: Register[] = ['CHILL', 'SOCIAL', 'HIGH_ENERGY'];
export const REGISTER_LABEL: Record<Register, string> = { CHILL: 'Chill', SOCIAL: 'Social', HIGH_ENERGY: 'High-Energy' };

// ── Caption tags ─────────────────────────────────────────────────────────
// Of the Tag Vocabulary's fixed five, a round-up keeps three: it spans every
// venue, zone and category. LOCKED: rendered, never typed — a wrong one breaks
// the archive for good, and the vocabulary never retro-fixes by republishing.
export const LOCKED_TAGS = ['#PartyWeya', '#WhereToGoKampala', '#KampalaNightlife'] as const;
// The other seven are suggestions: a wrong one only wastes a slot.
export const SUGGESTED_TAGS = ['#ChillKampala', '#SocialKampala', '#HighEnergyKampala', '#KampalaThisWeek', '', '', ''];

/** "#chill kampala" → "#ChillKampala"-ish: one leading #, no spaces or stray #s. */
export const cleanTag = (t: string) => {
	const body = t.replace(/[#\s]/g, '');
	return body ? `#${body}` : '';
};

/** Venue and zone tags belong to the carousel cuts, never to a round-up's ten. */
export function placeTagClash(tag: string, places: string[]) {
	const k = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
	const t = k(tag);
	return t.length >= 4 ? (places.find((p) => k(p).length >= 4 && (t === k(p) || t.startsWith(k(p)))) ?? null) : null;
}

// ── Entries ──────────────────────────────────────────────────────────────

export interface Entry {
	key: string;
	date: string;
	kind: Row['kind'];
	residencyId: string | null;
	eventName: string;
	venue: string;
	zone: string | null;
	paidClient: boolean;
	category: string;
	startTime: string;
	price: string | null;
	register: Register;
	perk: string | null;
	claimType: string | null;
	attendedAt: string | null;
}

export function entryOf(r: Row): Entry {
	const p = r.perks[0];
	return {
		key: r.key,
		date: r.date,
		kind: r.kind,
		residencyId: r.residencyId ?? null,
		eventName: r.eventName,
		venue: r.venue.name,
		zone: r.venue.zone,
		paidClient: !!r.venue.paidClient,
		category: r.category,
		startTime: r.startTime!,
		price: r.priceGate == null ? null : shillings(r.priceGate),
		register: r.register!,
		perk: p ? [p.label, p.condition].filter(Boolean).join(' · ') : null,
		claimType: r.claimType,
		attendedAt: r.attendedAt
	};
}

/** "KABALAGALA–MUYENGA" → "Kabalagala–Muyenga"; "ENTEBBE RD. NORTH" → "Entebbe Rd. North"; "CBD" stays. */
export const zoneLabel = (zone: string) =>
	zone.length <= 3 ? zone : zone.toLowerCase().replace(/(^|[\s–-])(\p{L})/gu, (_, sep, c) => sep + c.toUpperCase());

/** One slide block, as one paste: the facts, then the line typed by hand. */
export function blockText(e: Entry, line: string) {
	return [
		dayHeading(e.date),
		e.eventName,
		[e.venue, e.zone && zoneLabel(e.zone)].filter(Boolean).join(' · '),
		[e.startTime, e.price, REGISTER_LABEL[e.register]].filter(Boolean).join(' · '),
		e.perk,
		line.trim() || null
	]
		.filter(Boolean)
		.join('\n');
}

/**
 * The order to show and publish: by night, Monday to Sunday, and within a
 * night by the position decided by hand. A row not yet placed goes after the
 * placed ones on its night, in the register's own order — never ahead of a
 * decision already made.
 */
export function ordered(entries: Entry[], positions: Map<string, number>) {
	const index = new Map(entries.map((e, i) => [e.key, i]));
	const pos = (e: Entry) => positions.get(e.key) ?? Number.MAX_SAFE_INTEGER;
	return [...entries].sort((a, b) => a.date.localeCompare(b.date) || pos(a) - pos(b) || index.get(a.key)! - index.get(b.key)!);
}

export const nights = <E extends { date: string }>(entries: E[]) => {
	const out: { date: string; entries: E[] }[] = [];
	for (const e of entries) {
		const last = out.at(-1);
		if (last?.date === e.date) last.entries.push(e);
		else out.push({ date: e.date, entries: [e] });
	}
	return out;
};

// ── Cover, caption, TikTok ───────────────────────────────────────────────

/** The count that actually cleared — reported after the gate, never promised before it. */
export const coverText = (count: number, week: string) =>
	`${count} ${count === 1 ? 'night' : 'nights'} · Mon ${shortDate(week)} – Sun ${shortDate(addDays(week, 6))}`;

/** Rule F6's pointer has to name all three moods. */
export const missingMoods = (pointer: string) =>
	REGISTERS.filter((r) => !pointer.toLowerCase().replace(/[-\s]/g, '').includes(REGISTER_LABEL[r].toLowerCase().replace(/[-\s]/g, '')));

export function captionText(intro: string, pointer: string, tags: string[]) {
	const all = [...LOCKED_TAGS, ...tags.map(cleanTag).filter(Boolean)];
	return [intro.trim(), pointer.trim(), all.join(' ')].filter(Boolean).join('\n\n');
}

const STRENGTH: Record<string, number> = { VETTED: 3, TRANSFERRED: 2, FACTUAL: 1 };

/**
 * The reduced cut: the strongest entry per register, for you to confirm or
 * change. Strongest = the strongest claim (a vouch beats a known act beats a
 * listing); ties go to whichever you placed earlier.
 */
export function proposeTikTok(inOrder: Entry[]): Partial<Record<Register, string>> {
	const out: Partial<Record<Register, string>> = {};
	for (const reg of REGISTERS) {
		const best = inOrder
			.filter((e) => e.register === reg)
			.reduce<Entry | null>((b, e) => (!b || (STRENGTH[e.claimType ?? ''] ?? 0) > (STRENGTH[b.claimType ?? ''] ?? 0) ? e : b), null);
		if (best) out[reg] = best.key;
	}
	return out;
}

export function tiktokText(picks: Entry[], total: number) {
	return [
		...picks.map((e) => `${REGISTER_LABEL[e.register]} · ${e.eventName} · ${e.venue} · ${dayHeading(e.date)} ${e.startTime}`),
		`All ${total} are in the pinned carousel.`
	].join('\n');
}

/** Where a published entry points: its dated row, or its standing night on that date. */
export const publicationTarget = (e: Entry) =>
	e.kind === 'STANDING' ? { residencyId: e.residencyId!, occurrenceId: null } : { occurrenceId: e.key, residencyId: null };
