import { redirect } from '@sveltejs/kit';
import { prisma } from '#lib/server/prisma.js';
import {
	SWEEP_DAYS,
	addDays,
	buildWeek,
	daysBetween,
	gate,
	isMonday,
	kampalaToday,
	nextMonday,
	shortDate,
	type OccurrenceIn,
	type Register,
	type ResidencyIn,
	type VenueIn
} from '#lib/build/week.js';
import type { PageServerLoad } from './$types';

// Timestamps → the Kampala calendar date; @db.Date columns are already dates.
const kampalaDate = (d: Date | null) => (d ? kampalaToday(d) : null);
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

const venueInclude = { zone: true } as const;
type VenueRow = {
	id: string;
	name: string;
	phone: string | null;
	zone: { name: string; division: string } | null;
};
const venueIn = (v: VenueRow): VenueIn => ({
	id: v.id,
	name: v.name,
	phone: v.phone,
	zone: v.zone?.name ?? null,
	division: v.zone?.division ?? null
});

export const load: PageServerLoad = async ({ url }) => {
	const today = kampalaToday();
	const week = url.searchParams.get('week');
	if (!week || !/^\d{4}-\d{2}-\d{2}$/.test(week) || !isMonday(week)) {
		redirect(307, `/build?week=${nextMonday(today)}`);
	}
	const weekEnd = addDays(week, 6);

	const [residencies, occurrences, dueVenues, stats] = await Promise.all([
		prisma.residency.findMany({
			where: { active: true },
			include: { venue: { include: venueInclude } }
		}),
		prisma.occurrence.findMany({
			where: { date: { gte: new Date(`${week}T00:00:00Z`), lte: new Date(`${weekEnd}T00:00:00Z`) } },
			include: { venue: { include: venueInclude } }
		}),
		prisma.venue.findMany({
			where: { nextContactDue: { lte: new Date(`${weekEnd}T23:59:59+03:00`) } },
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

	const rows = buildWeek(
		week,
		residencies.map(
			(r): ResidencyIn => ({
				id: r.id,
				venue: venueIn(r.venue),
				eventName: r.eventName,
				category: r.category,
				dayOfWeek: r.dayOfWeek,
				startTime: r.startTime,
				priceGate: r.priceGate,
				register: r.register as Register,
				recurrence: r.recurrence,
				claimType: r.claimType,
				source: r.source,
				lastConfirmed: kampalaDate(r.lastConfirmed)
			})
		),
		occurrences.map(
			(o): OccurrenceIn => ({
				id: o.id,
				date: isoDate(o.date),
				venue: venueIn(o.venue),
				residencyId: o.residencyId,
				eventName: o.eventName,
				category: o.category,
				startTime: o.startTime,
				priceGate: o.priceGate,
				priceNote: o.priceNote,
				register: o.register as Register | null,
				claimType: o.claimType,
				source: o.source,
				status: o.status,
				confirmedOn: kampalaDate(o.confirmedOn)
			})
		)
	);

	// Due a call: the cadence (nextContactDue), plus standing nights whose
	// monthly sweep has lapsed. Not this week's gaps — that's a separate list.
	const calls = new Map<string, { venue: string; phone: string | null; reasons: string[] }>();
	const addCall = (id: string, venue: string, phone: string | null, reason: string) => {
		const entry = calls.get(id) ?? { venue, phone, reasons: [] };
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
	return {
		week,
		weekEnd,
		today,
		rows,
		gate: gate(week, rows),
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
