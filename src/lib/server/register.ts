// Reading the register into the shapes the build and call-round logic use.

import { prisma } from './prisma.js';
import {
	addDays,
	buildWeek,
	gate,
	isMonday,
	kampalaToday,
	type OccurrenceIn,
	type Register,
	type ResidencyIn,
	type VenueIn
} from '#lib/build/week.js';

// Timestamps → the Kampala calendar date; @db.Date columns are already dates.
export const kampalaDate = (d: Date | null) => (d ? kampalaToday(d) : null);
export const isoDate = (d: Date) => d.toISOString().slice(0, 10);
export const asDate = (day: string) => new Date(`${day}T00:00:00Z`);

export const isWeek = (week: string | null): week is string =>
	!!week && /^\d{4}-\d{2}-\d{2}$/.test(week) && isMonday(week);

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

/** One Mon–Sun week: the active residencies it was built from, its rows and its gate. */
export async function loadWeek(week: string) {
	const weekEnd = addDays(week, 6);
	const [residencies, occurrences] = await Promise.all([
		prisma.residency.findMany({
			where: { active: true },
			include: { venue: { include: { zone: true } } }
		}),
		prisma.occurrence.findMany({
			where: { date: { gte: asDate(week), lte: asDate(weekEnd) } },
			include: { venue: { include: { zone: true } } }
		})
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

	return { weekEnd, residencies, rows, gate: gate(week, rows) };
}
