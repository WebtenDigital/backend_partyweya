import { fail } from '@sveltejs/kit';
import { prisma } from '#lib/server/prisma.js';
import { failureMessage } from '#lib/server/forms.js';
import { saveContact } from '#lib/server/venues.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const [venues, zones] = await Promise.all([
		prisma.venue.findMany({
			orderBy: { name: 'asc' },
			select: {
				id: true,
				name: true,
				location: true,
				zoneName: true,
				phone: true,
				whatsapp: true,
				phoneVerifiedAt: true,
				updatedAt: true
			}
		}),
		prisma.zone.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } })
	]);
	return {
		venues: venues.map((v) => ({
			...v,
			phoneVerifiedAt: v.phoneVerifiedAt?.toISOString() ?? null,
			updatedAt: v.updatedAt.toISOString()
		})),
		zones: zones.map((z) => ({ name: z.name, division: z.division }))
	};
};

export const actions: Actions = {
	// One venue's number, WhatsApp flag or zone. Also posted to from the call queue.
	contact: async ({ request }) => {
		try {
			return { saved: await saveContact(await request.formData()) };
		} catch (e) {
			const message = failureMessage(e);
			if (message) return fail(400, { error: message });
			console.error(e);
			return fail(500, { error: 'The save failed. Nothing was written.' });
		}
	}
};
