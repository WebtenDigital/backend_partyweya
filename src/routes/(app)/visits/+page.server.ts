import { fail } from '@sveltejs/kit';
import { prisma } from '#lib/server/prisma.js';
import { failureMessage, text } from '#lib/server/forms.js';
import { asDate, isoDate } from '#lib/server/register.js';
import { dismissVisit, visitsDue } from '#lib/server/visits.js';
import { isoDay } from '#lib/build/add.js';
import { addDays, kampalaToday } from '#lib/build/week.js';
import type { Actions, PageServerLoad } from './$types';

// Where the Visits badge leads: a planned visit that happened and wasn't
// written up, and — for a night out nobody planned — a picker to the same
// write-up. An unplanned write-up creates no Visit: the Visit records
// intention, the Occurrence records the visit.

const FORTNIGHT = 14;

export const load: PageServerLoad = async ({ url }) => {
	const today = kampalaToday();
	const since = addDays(today, -(FORTNIGHT - 1));
	const venueId = url.searchParams.get('venue');
	const [due, venues] = await Promise.all([
		visitsDue(today),
		prisma.venue.findMany({
			where: { OR: [{ residencies: { some: { active: true } } }, { occurrences: { some: { date: { gte: asDate(since), lte: asDate(today) } } } }] },
			select: { id: true, name: true },
			orderBy: { name: 'asc' }
		})
	]);
	// The chosen venue's nights, each with the dates in the last fortnight it ran on.
	let nights: { ref: string; eventName: string; dates: string[] }[] = [];
	if (venueId) {
		const [standing, dated] = await Promise.all([
			prisma.residency.findMany({ where: { venueId, active: true }, select: { id: true, eventName: true, dayOfWeek: true }, orderBy: { dayOfWeek: 'asc' } }),
			prisma.occurrence.findMany({
				where: { venueId, residencyId: null, date: { gte: asDate(since), lte: asDate(today) } },
				select: { id: true, eventName: true, date: true },
				orderBy: { date: 'desc' }
			})
		]);
		const fortnight = Array.from({ length: FORTNIGHT }, (_, i) => addDays(today, -i));
		nights = [
			...standing.map((r) => ({ ref: r.id, eventName: r.eventName, dates: fortnight.filter((d) => isoDay(d) === r.dayOfWeek) })),
			...dated.map((o) => ({ ref: o.id, eventName: o.eventName, dates: [isoDate(o.date)] }))
		];
	}
	return { today, due, venues, venueId, nights };
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
	}
};
