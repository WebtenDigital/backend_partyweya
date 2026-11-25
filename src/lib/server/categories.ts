// The standing-night side of the category pages: how many active standing
// nights each category has, and how many of those had their category SAID
// (categoryAskedAt) rather than inferred. A category page's count is only as
// good as that — and every THEMED_NIGHT is a night that may belong elsewhere —
// so both numbers are shown, always, even at zero.

import { prisma } from './prisma.js';
import type { Tx } from './db.js';
import { CATEGORIES, type CategoryKey } from '../build/categories.js';

export interface Standing {
	total: Record<CategoryKey, number>;
	asked: Record<CategoryKey, number>; // category said by the venue, not inferred
}

export async function standingCounts(db: Tx = prisma): Promise<Standing> {
	const rows = await db.residency.groupBy({ by: ['category'], where: { active: true }, _count: { _all: true } });
	const asked = await db.residency.groupBy({ by: ['category'], where: { active: true, categoryAskedAt: { not: null } }, _count: { _all: true } });
	const zero = () => Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<CategoryKey, number>;
	const total = zero();
	const said = zero();
	for (const r of rows) total[r.category as CategoryKey] = r._count._all;
	for (const r of asked) said[r.category as CategoryKey] = r._count._all;
	return { total, asked: said };
}

/**
 * The worklist that clears the guesswork: every active standing night filed
 * THEMED_NIGHT, or whose category nobody has asked. By venue, so a call
 * session can work down it — the call script already asks question 5.
 */
export async function unclassifiedNights(db: Tx = prisma) {
	const rows = await db.residency.findMany({
		where: { active: true, OR: [{ category: 'THEMED_NIGHT' }, { categoryAskedAt: null }] },
		select: {
			id: true,
			eventName: true,
			dayOfWeek: true,
			category: true,
			categoryAskedAt: true,
			venue: { select: { id: true, name: true, zoneName: true } }
		}
	});
	return rows
		.map((r) => ({
			id: r.id,
			eventName: r.eventName,
			dayOfWeek: r.dayOfWeek,
			category: r.category,
			asked: r.categoryAskedAt != null,
			venueId: r.venue.id,
			venue: r.venue.name,
			zone: r.venue.zoneName
		}))
		.sort((a, b) => a.venue.localeCompare(b.venue) || a.dayOfWeek - b.dayOfWeek || a.eventName.localeCompare(b.eventName));
}
