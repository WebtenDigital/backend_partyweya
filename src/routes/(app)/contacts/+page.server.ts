import { fail, redirect } from '@sveltejs/kit';
import { prisma } from '#lib/server/prisma.js';
import { Invalid, failureMessage, phone, phoneList, text } from '#lib/server/forms.js';
import { numbersUpdate } from '#lib/server/venues.js';
import type { Actions, PageServerLoad } from './$types';

// Nothing to show: this route only takes the "Who to call about this" panel's number.
export const load: PageServerLoad = () => redirect(307, '/venues');

export const actions: Actions = {
	// Typing a number is not a phone call: this writes the number and nothing else —
	// no lastContacted, no nextContactDue, and the number starts unverified.
	phone: async ({ request }) => {
		const f = await request.formData();
		try {
			const kind = text(f, 'kind');
			const id = text(f, 'id');
			if (!id) throw new Invalid('Missing record — reload the page.');
			const whatsapp = f.get('whatsapp') === 'true';
			const where = { id };
			// A venue can have several numbers; the same rule as the venue list.
			if (kind === 'venue') {
				const phones = phoneList(f, 'phone');
				if (!phones.length) throw new Invalid('Type the number first.');
				await prisma.venue.update({ where, data: { ...(await numbersUpdate(id, phones)), whatsapp } });
				return { saved: phones.join(' / ') };
			}
			const number = phone(f, 'phone');
			if (!number) throw new Invalid('Type the number first.');
			const data = { phone: number, phoneVerifiedAt: null, whatsapp };
			const { count } =
				kind === 'organiser'
						? await prisma.organiser.updateMany({ where, data })
						: kind === 'act'
							? await prisma.act.updateMany({ where, data })
							: { count: -1 };
			if (count === -1) throw new Invalid(`Unknown kind of record: ${kind}`);
			if (count === 0) throw new Invalid('That record is no longer in the register.');
			return { saved: number };
		} catch (e) {
			const message = failureMessage(e);
			if (message) return fail(400, { error: message });
			console.error(e);
			return fail(500, { error: 'The save failed. Nothing was written.' });
		}
	}
};
