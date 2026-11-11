// Saving a night's offers from a form's perks editor. The editor posts its
// rows as parallel lists (perk_id, perk_kind, perk_label, perk_condition,
// perk_until, and on a call perk_scope and perk_confirmed) plus `perks_sent`,
// so a form without the editor never touches perks. The submitted list
// replaces the night's offers: rows kept are updated, new ones created,
// missing ones deleted.
//
// An offer has its own confirmation, apart from its night's: a call moves the
// night's lastConfirmed every time, but an offer is only confirmed when the
// caller ticks it as still on (or has just heard it, for a new one).

import { PerkKind } from './prisma.js';
import { Invalid, oneOf } from './forms.js';
import { asDate } from './register.js';
import type { Tx } from './db.js';

type Parent = { residencyId: string } | { occurrenceId: string };
type Confirmed = { at: Date; by: string | null } | null;
export type ParsedPerk = NonNullable<ReturnType<typeof parsePerks>>[number];

/**
 * `prefix` names the editor's fields ('perk' → perk_id …); `rows` takes a slice
 * of them, for a form with several editors in a row (the night blocks).
 */
export function parsePerks(f: FormData, prefix = 'perk', rows?: { from: number; count: number }) {
	if (!rows && !f.has(`${prefix}s_sent`)) return null;
	const list = (k: string) => {
		const all = f.getAll(`${prefix}_${k}`).map((v) => (typeof v === 'string' ? v.trim() : ''));
		return rows ? all.slice(rows.from, rows.from + rows.count) : all;
	};
	const [ids, kinds, labels, conditions, untils, scopes, confirmed] = ['id', 'kind', 'label', 'condition', 'until', 'scope', 'confirmed'].map(list);

	return labels
		.map((label, i) => ({
			id: ids[i] || null,
			kind: kinds[i],
			label,
			condition: conditions[i] || null,
			until: untils[i] || null,
			scope: scopes[i] === 'once' ? ('once' as const) : scopes[i] === 'weekly' ? ('weekly' as const) : null,
			confirmed: confirmed[i] === '1'
		}))
		.filter((p) => p.label || p.condition) // a fully blank row is just an unused line
		.map((p, sortOrder) => {
			if (!p.label) throw new Invalid('Every offer needs a label — “Half-price cocktails”, not just a condition.');
			if (p.until && !/^\d{4}-\d{2}-\d{2}$/.test(p.until)) throw new Invalid(`“${p.label}”: the end date must be a date.`);
			return {
				id: p.id,
				kind: oneOf(PerkKind, p.kind, 'offer kind') ?? 'OTHER',
				label: p.label,
				condition: p.condition,
				activeUntil: p.until ? asDate(p.until) : null,
				sortOrder,
				scope: p.scope, //         every week, or just this date — only a call asks
				confirmed: p.confirmed //  heard on this call to be still on
			};
		});
}

/** Whether the offers question got an answer: an offer, or "they have none". */
export const offersAnswered = (perks: ParsedPerk[] | null, none: FormDataEntryValue | null | undefined) => !!perks?.length || none === '1';

const columns = ({ scope: _scope, confirmed, ...p }: Omit<ParsedPerk, 'id'>, by: Confirmed) => ({
	...p,
	...(confirmed && by && { confirmedOn: by.at, confirmedBy: by.by })
});

/** `confirmed` is the call that heard them; without one (a desk edit) no offer's confirmation moves. */
export async function savePerks(tx: Tx, parent: Parent, from: FormData | ParsedPerk[] | null, confirmed: Confirmed = null) {
	const perks = from instanceof FormData ? parsePerks(from) : from;
	if (perks === null) return;
	const keep = perks.map((p) => p.id).filter((id): id is string => !!id);
	await tx.perk.deleteMany({ where: { ...parent, id: { notIn: keep } } });
	for (const { id, ...p } of perks) {
		const data = columns(p, confirmed);
		if (id) {
			const { count } = await tx.perk.updateMany({ where: { id, ...parent }, data });
			if (count === 0) throw new Invalid('An offer changed since you loaded the page — reload and try again.');
		} else {
			await tx.perk.create({ data: { ...parent, ...data } });
		}
	}
}

/**
 * Adding offers from "Add to the register": new rows only, never a replacement.
 * Merging into an existing night must not delete offers the user didn't retype
 * — they may be working from a flyer that mentions one. An offer already on
 * the night (same kind, label and condition) isn't added twice. Returns how
 * many rows were created.
 */
export async function addPerks(tx: Tx, parent: Parent, from: FormData | ParsedPerk[] | null, confirmed: Confirmed = null) {
	const perks = from instanceof FormData ? parsePerks(from) : from;
	if (!perks?.length) return 0;
	const existing = await tx.perk.findMany({ where: parent, select: { kind: true, label: true, condition: true, sortOrder: true } });
	const key = (p: { kind: string; label: string; condition: string | null }) =>
		[p.kind, p.label.trim().toLowerCase(), (p.condition ?? '').trim().toLowerCase()].join('|');
	const seen = new Set(existing.map(key));
	let order = existing.reduce((max, p) => Math.max(max, p.sortOrder + 1), 0);
	let created = 0;
	for (const { id: _id, sortOrder: _s, ...p } of perks) {
		if (seen.has(key(p))) continue;
		seen.add(key(p));
		await tx.perk.create({ data: { ...parent, ...columns({ ...p, sortOrder: order++ }, confirmed) } });
		created++;
	}
	return created;
}
