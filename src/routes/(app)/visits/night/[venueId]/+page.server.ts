import { error, fail, redirect } from '@sveltejs/kit';
import { prisma, Category } from '#lib/server/prisma.js';
import { failureMessage } from '#lib/server/forms.js';
import { RECURRENCES, addNightOut } from '#lib/server/nights.js';
import { addDays, kampalaToday } from '#lib/build/week.js';
import type { Actions, PageServerLoad } from './$types';

// A night out at a venue with nothing on file: add the night first — the same
// night block the discovery call uses — then straight into its write-up. The
// night goes in unconfirmed and claim-less, like a flyer would; the write-up
// is what makes it attended. No Visit row: this records a visit, not a plan.

export const load: PageServerLoad = async ({ params }) => {
	const v = await prisma.venue.findUnique({ where: { id: params.venueId }, select: { id: true, name: true, zoneName: true, location: true, noProgramme: true } });
	if (!v) error(404, 'No such venue');
	const today = kampalaToday();
	return { today, earliest: addDays(today, -13), venue: v, categories: Object.values(Category), recurrences: RECURRENCES };
};

export const actions: Actions = {
	save: async ({ params, request }) => {
		const f = await request.formData();
		let next: string;
		try {
			next = await prisma.$transaction((tx) => addNightOut(tx, params.venueId, f, kampalaToday()));
		} catch (e) {
			const message = failureMessage(e);
			if (message) return fail(400, { error: message });
			console.error(e);
			return fail(500, { error: 'The save failed. Nothing was written.' });
		}
		redirect(303, next);
	}
};
