import { fail, redirect } from '@sveltejs/kit';
import { prisma } from '#lib/server/prisma.js';
import { failureMessage, text } from '#lib/server/forms.js';
import { asDate, isoDate } from '#lib/server/register.js';
import { dismissVisit, visitsDue } from '#lib/server/visits.js';
import { createVenue } from '#lib/server/venues.js';
import { isoDay } from '#lib/build/add.js';
import { addDays, kampalaToday } from '#lib/build/week.js';
import type { NightOption, VenueOption } from '#lib/build/nightout.js';
import type { Actions, PageServerLoad } from './$types';

// Where the Visits badge leads: a planned visit that happened and wasn't
// written up, and — for a night out nobody planned — a type-ahead to the
// write-up. An unplanned night is often at a venue with nothing on file, or
// one not in the register at all; neither may end the flow. Nothing here
// creates a Visit: the Visit records intention, the Occurrence the visit.

const FORTNIGHT = 14;

export const load: PageServerLoad = async () => {
	const today = kampalaToday();
	const since = addDays(today, -(FORTNIGHT - 1));
	const fortnight = Array.from({ length: FORTNIGHT }, (_, i) => addDays(today, -i)); // most recent first
	const [due, venues, standing, dated, zones] = await Promise.all([
		visitsDue(today),
		prisma.venue.findMany({ select: { id: true, name: true, zoneName: true, noProgramme: true }, orderBy: { name: 'asc' } }),
		prisma.residency.findMany({ where: { active: true }, select: { id: true, venueId: true, eventName: true, category: true, dayOfWeek: true, startTime: true } }),
		prisma.occurrence.findMany({
			where: { residencyId: null, status: { not: 'CANCELLED' }, date: { gte: asDate(since), lte: asDate(today) } },
			select: { id: true, venueId: true, eventName: true, category: true, date: true, startTime: true }
		}),
		prisma.zone.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' }, select: { name: true } })
	]);
	const byId = new Map(venues.map((v) => [v.id, v]));
	const nights: NightOption[] = [
		...standing.map((r) => ({
			kind: 'night' as const,
			ref: r.id,
			venueId: r.venueId,
			venue: byId.get(r.venueId)!.name,
			zone: byId.get(r.venueId)!.zoneName,
			eventName: r.eventName,
			category: r.category,
			dayOfWeek: r.dayOfWeek,
			startTime: r.startTime,
			dates: fortnight.filter((d) => isoDay(d) === r.dayOfWeek)
		})),
		...dated.map((o) => ({
			kind: 'night' as const,
			ref: o.id,
			venueId: o.venueId,
			venue: byId.get(o.venueId)!.name,
			zone: byId.get(o.venueId)!.zoneName,
			eventName: o.eventName,
			category: o.category,
			dayOfWeek: null,
			startTime: o.startTime,
			dates: [isoDate(o.date)]
		}))
	];
	// Venues with nothing that ran in the fortnight: the night out needs adding first.
	const ran = new Set(nights.filter((n) => n.dates.length).map((n) => n.venueId));
	const nightless: VenueOption[] = venues
		.filter((v) => !ran.has(v.id))
		.map((v) => ({ kind: 'venue' as const, venueId: v.id, venue: v.name, zone: v.zoneName, noProgramme: v.noProgramme }));
	return { today, due, nights, venues: nightless, zones: zones.map((z) => z.name) };
};

export const actions: Actions = {
	dismiss: async ({ request }) => {
		try {
			const id = text(await request.formData(), 'id');
			if (id) await dismissVisit(prisma, id);
		} catch (e) {
			const message = failureMessage(e);
			if (message) return fail(400, { error: message });
			console.error(e);
			return fail(500, { error: 'Not dismissed. Nothing was written.' });
		}
		return { dismissed: true };
	},

	// A place not in the register: add it (the one way a venue is created), then its night.
	newVenue: async ({ request }) => {
		const f = await request.formData();
		let id: string;
		try {
			id = (await createVenue(prisma, { name: text(f, 'name') ?? '', zoneName: text(f, 'zoneName') })).id;
		} catch (e) {
			const message = failureMessage(e);
			if (message) return fail(400, { newVenueError: message });
			console.error(e);
			return fail(500, { newVenueError: 'Not added. Nothing was written.' });
		}
		redirect(303, `/visits/night/${id}`);
	}
};
