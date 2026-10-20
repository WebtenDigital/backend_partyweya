// Saving a night's offers from a form's perks editor. The editor posts its
// rows as parallel lists (perk_id, perk_kind, perk_label, perk_condition,
// perk_until) plus `perks_sent`, so a form without the editor never touches
// perks. The submitted list replaces the night's offers: rows kept are
// updated, new ones created, missing ones deleted.

import { PerkKind } from './prisma.js';
import { Invalid, oneOf } from './forms.js';
import { asDate } from './register.js';
import type { Tx } from './db.js';

type Parent = { residencyId: string } | { occurrenceId: string };

export function parsePerks(f: FormData) {
	if (!f.has('perks_sent')) return null;
	const list = (k: string) => f.getAll(k).map((v) => (typeof v === 'string' ? v.trim() : ''));
	const [ids, kinds, labels, conditions, untils] = ['perk_id', 'perk_kind', 'perk_label', 'perk_condition', 'perk_until'].map(list);

	return labels
		.map((label, i) => ({ id: ids[i] || null, kind: kinds[i], label, condition: conditions[i] || null, until: untils[i] || null }))
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
				sortOrder
			};
		});
}

export async function savePerks(tx: Tx, parent: Parent, f: FormData) {
	const perks = parsePerks(f);
	if (perks === null) return;
	const keep = perks.map((p) => p.id).filter((id): id is string => !!id);
	await tx.perk.deleteMany({ where: { ...parent, id: { notIn: keep } } });
	for (const { id, ...data } of perks) {
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
export async function addPerks(tx: Tx, parent: Parent, f: FormData) {
	const perks = parsePerks(f);
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
		await tx.perk.create({ data: { ...parent, ...p, sortOrder: order++ } });
		created++;
	}
	return created;
}
