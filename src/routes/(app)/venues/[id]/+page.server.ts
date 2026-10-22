import { error, fail } from '@sveltejs/kit';
import { prisma } from '#lib/server/prisma.js';
import { Invalid, failureMessage, text } from '#lib/server/forms.js';
import { asDate, isoDate, kampalaDate } from '#lib/server/register.js';
import { kampalaToday } from '#lib/build/week.js';
import { areaVocabulary, saveVenue } from '#lib/server/venues.js';
import { dialNumber } from '#lib/phones.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const v = await prisma.venue.findUnique({
		where: { id: params.id },
		include: {
			zone: true,
			residencies: { orderBy: { dayOfWeek: 'asc' }, select: { id: true, eventName: true, dayOfWeek: true, startTime: true, active: true, stoppedReason: true } },
			occurrences: {
				where: { date: { gte: asDate(kampalaToday()) } },
				orderBy: { date: 'asc' },
				select: { id: true, eventName: true, date: true, status: true }
			}
		}
	});
	if (!v) error(404, 'No such venue');
	const [zones, areas] = await Promise.all([
		prisma.zone.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' }, select: { name: true } }),
		areaVocabulary()
	]);
	return {
		zones: zones.map((z) => z.name),
		areas,
		venue: {
			id: v.id,
			name: v.name,
			location: v.location,
			areas: v.areas,
			zone: v.zone?.name ?? null,
			division: v.zone?.division ?? null,
			phones: v.phones,
			phone: dialNumber(v), // the number a call dials, and the one WhatsApp is about
			whatsapp: v.whatsapp,
			contactName: v.contactName,
			contactRole: v.contactRole,
			lastContacted: kampalaDate(v.lastContacted),
			dressCode: v.dressCode,
			parkingNote: v.parkingNote,
			hasFood: v.hasFood,
			updatedAt: v.updatedAt.toISOString()
		},
		residencies: v.residencies,
		occurrences: v.occurrences.map((o) => ({ ...o, date: isoDate(o.date) }))
	};
};

export const actions: Actions = {
	// Name, location, surroundings and zone. The same saveVenue the venue list's
	// zone dropdown calls, so zone has one write path. The id never changes.
	place: async ({ params, request }) => {
		const f = await request.formData();
		f.set('id', params.id);
		try {
			await saveVenue(f);
		} catch (e) {
			const message = failureMessage(e);
			if (message) return fail(400, { placeError: message });
			console.error(e);
			return fail(500, { placeError: 'The save failed. Nothing was written.' });
		}
		return { placed: true };
	},
	// The venue's stable facts. Never the call fields: lastContacted and
	// nextContactDue belong to a logged call.
	facts: async ({ params, request }) => {
		const f = await request.formData();
		try {
			const seen = text(f, 'updatedAt');
			if (!seen) throw new Invalid('Reload the page and try again.');
			const food = text(f, 'hasFood');
			const { count } = await prisma.venue.updateMany({
				where: { id: params.id, updatedAt: new Date(seen) },
				data: {
					dressCode: text(f, 'dressCode'),
					parkingNote: text(f, 'parkingNote'),
					hasFood: food === 'yes' ? true : food === 'no' ? false : null
				}
			});
			if (count === 0) throw new Invalid('This venue changed since you loaded the page — reload to see the latest.');
		} catch (e) {
			const message = failureMessage(e);
			if (message) return fail(400, { error: message });
			console.error(e);
			return fail(500, { error: 'The save failed. Nothing was written.' });
		}
		return { saved: true };
	}
};
