import { fail } from '@sveltejs/kit';
import { prisma } from '#lib/server/prisma.js';
import { failureMessage } from '#lib/server/forms.js';
import { areaVocabulary, createVenueFrom, saveVenue } from '#lib/server/venues.js';
import type { Actions, PageServerLoad } from './$types';

const rowFields = {
	id: true,
	name: true,
	location: true,
	zoneName: true,
	phones: true,
	verifiedPhone: true,
	whatsapp: true,
	phoneVerifiedAt: true,
	updatedAt: true
} as const;

type RowFields = { phoneVerifiedAt: Date | null; updatedAt: Date };
const asRow = <V extends RowFields>(v: V) => ({
	...v,
	phoneVerifiedAt: v.phoneVerifiedAt?.toISOString() ?? null,
	updatedAt: v.updatedAt.toISOString()
});

export const load: PageServerLoad = async () => {
	const [venues, zones, areas] = await Promise.all([
		prisma.venue.findMany({ orderBy: { name: 'asc' }, select: rowFields }),
		prisma.zone.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
		areaVocabulary()
	]);
	return {
		venues: venues.map(asRow),
		zones: zones.map((z) => ({ name: z.name, division: z.division })),
		areas
	};
};

const failed = (e: unknown) => {
	const message = failureMessage(e);
	if (message) return fail(400, { error: message });
	console.error(e);
	return fail(500, { error: 'The save failed. Nothing was written.' });
};

export const actions: Actions = {
	// One venue's number, WhatsApp flag or zone. Also posted to from the call queue.
	contact: async ({ request }) => {
		try {
			return { saved: await saveVenue(await request.formData()) };
		} catch (e) {
			return failed(e);
		}
	},
	// The blank row: a venue with no night yet, which is a Tier C lead.
	create: async ({ request }) => {
		try {
			const { id, name, location, zoneName, phones, verifiedPhone, whatsapp, phoneVerifiedAt, updatedAt } = await createVenueFrom(await request.formData());
			return { created: asRow({ id, name, location, zoneName, phones, verifiedPhone, whatsapp, phoneVerifiedAt, updatedAt }) };
		} catch (e) {
			return failed(e);
		}
	}
};
