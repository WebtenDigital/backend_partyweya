import { redirect } from '@sveltejs/kit';
import { prisma } from '#lib/server/prisma.js';
import { isWeek, kampalaDate, loadWeek } from '#lib/server/register.js';
import { SWEEP_DAYS, addDays, daysBetween, kampalaToday, nextMonday, shortDate } from '#lib/build/week.js';
import { unclassified } from '#lib/server/acts.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const today = kampalaToday();
	const week = url.searchParams.get('week');
	if (!isWeek(week)) redirect(307, `/build?week=${nextMonday(today)}`);

	const [{ weekEnd, residencies, rows, gate }, dueVenues, stats] = await Promise.all([
		loadWeek(week),
		prisma.venue.findMany({
			where: { nextContactDue: { lte: new Date(`${addDays(week, 6)}T23:59:59+03:00`) } },
			orderBy: { nextContactDue: 'asc' }
		}),
		Promise.all([
			prisma.venue.count(),
			prisma.residency.groupBy({ by: ['venueId'], where: { active: true } }),
			prisma.residency.count({ where: { active: true } }),
			prisma.residency.count({ where: { active: true, register: 'CHILL' } }),
			prisma.venue.count({ where: { conversationTest: { not: null } } })
		])
	]);

	// Due a call: the cadence (nextContactDue), plus standing nights whose
	// monthly sweep has lapsed. Not this week's gaps — that's a separate list.
	const calls = new Map<string, { id: string; venue: string; phone: string | null; reasons: string[] }>();
	const addCall = (id: string, venue: string, phone: string | null, reason: string) => {
		const entry = calls.get(id) ?? { id, venue, phone, reasons: [] };
		if (!entry.reasons.includes(reason)) entry.reasons.push(reason);
		calls.set(id, entry);
	};
	for (const v of dueVenues) {
		const last = kampalaDate(v.lastContacted);
		addCall(v.id, v.name, v.phone, last ? `Due · last called ${shortDate(last)}` : 'Due · never reached');
	}
	for (const r of residencies) {
		const last = kampalaDate(r.lastConfirmed);
		if (last && daysBetween(last, week) <= SWEEP_DAYS) continue;
		addCall(
			r.venueId,
			r.venue.name,
			r.venue.phone,
			last ? 'Standing roster · monthly sweep due' : 'Standing roster · never confirmed'
		);
	}

	const [venueCount, standingVenues, standingNights, chillNights, tested] = stats;
	const newActs = await unclassified((url.searchParams.get('newacts') ?? '').split('|').filter(Boolean));
	return {
		newActs,
		week,
		weekEnd,
		today,
		rows,
		gate,
		calls: [...calls.values()].sort((a, b) => a.venue.localeCompare(b.venue)),
		supply: {
			venues: venueCount,
			standingVenues: standingVenues.length,
			standingNights,
			chillNights,
			tested
		}
	};
};
