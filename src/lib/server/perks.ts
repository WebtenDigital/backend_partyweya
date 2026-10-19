// Saving a night's offers from a form's perks editor. The editor posts its
// rows as parallel lists (perk_id, perk_kind, perk_label, perk_condition,
// perk_until) plus `perks_sent`, so a form without the editor never touches
// perks. The submitted list replaces the night's offers: rows kept are
// updated, new ones created, missing ones deleted.

import { PerkKind } from './prisma.js';
import { Invalid, oneOf } from './forms.js';
import { asDate } from './register.js';
import type { Prisma } from '../../generated/prisma/client';

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

export async function savePerks(tx: Prisma.TransactionClient, parent: Parent, f: FormData) {
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
