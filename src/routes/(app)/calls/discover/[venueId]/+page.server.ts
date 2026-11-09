import { error, fail, redirect } from '@sveltejs/kit';
import { CALLER_NAME } from '$app/env/private';
import { prisma, Category, ConversationTest, type Register, type Source } from '#lib/server/prisma.js';
import { RECURRENCES, createNights, nightsFrom } from '#lib/server/nights.js';
import { Invalid, failureMessage, oneOf, text } from '#lib/server/forms.js';
import { Q6 } from '#lib/build/calls.js';
import { kampalaToday, nextMonday } from '#lib/build/week.js';
import { answeredOn, dialNumber, samePhone } from '#lib/phones.js';
import { expectedRegister } from '#lib/server/discovery.js';
import type { Actions, PageServerLoad } from './$types';

// The discovery call: one venue, no night on file. Question 6 first — it's the
// only thing that can produce a Chill night — then every night they run.
// Weekly and monthly nights become Residencies, a one-off an Occurrence: a
// weekly night written as a dated row would have to be retyped every week.
// Everything here is FACTUAL — a call can't vouch for a room, and the database
// refuses VETTED from any source but attendance.

export const load: PageServerLoad = async ({ params, url }) => {
	const v = await prisma.venue.findUnique({
		where: { id: params.venueId },
		include: {
			zone: true,
			_count: { select: { residencies: true, occurrences: true } }
		}
	});
	if (!v) error(404, 'No such venue');
	const week = url.searchParams.get('week') ?? nextMonday(kampalaToday());
	return {
		week,
		today: kampalaToday(),
		caller: CALLER_NAME,
		venue: {
			id: v.id,
			name: v.name,
			location: v.location,
			zone: v.zone?.name ?? null,
			phones: v.phones,
			dial: dialNumber(v),
			contactName: v.contactName,
			conversationTest: v.conversationTest,
			contactAttempts: v.contactAttempts,
			lastContacted: v.lastContacted?.toISOString().slice(0, 10) ?? null,
			expected: expectedRegister(v.name),
			// Already has a night: the ordinary call screen is the right one.
			nights: v._count.residencies + v._count.occurrences
		},
		categories: Object.values(Category),
		recurrences: RECURRENCES
	};
};

export const actions: Actions = {
	save: async ({ params, request }) => {
		const f = await request.formData();
		const now = new Date();
		const today = kampalaToday(now);
		const week = text(f, 'week') ?? nextMonday(today);
		try {
			const venue = await prisma.venue.findUnique({
				where: { id: params.venueId },
				select: { id: true, phones: true, verifiedPhone: true }
			});
			if (!venue) throw new Invalid('No such venue.');
			const outcome = text(f, 'outcome');

			// No answer: one more attempt on the count; discovery tries again the next working
			// day after lastAttemptAt. Not a contact, so lastContacted doesn't move — and the
			// venue stays on the list.
			if (outcome === 'no-answer') {
				await prisma.venue.update({
					where: { id: venue.id },
					data: { contactAttempts: { increment: 1 }, lastAttemptAt: now }
				});
			} else if (outcome === 'nights' || outcome === 'nothing') {
				await reached(f, venue, outcome, now, today);
			} else throw new Invalid('Say how the call ended: nights recorded, runs nothing, or no answer.');
		} catch (e) {
			const message = failureMessage(e);
			if (message) return fail(400, { error: message });
			console.error(e);
			return fail(500, { error: 'The save failed. Nothing was written.' });
		}
		redirect(303, `/calls?week=${week}`);
	}
};

/** A call that reached them: question 6, then the nights — or "runs nothing". */
async function reached(
	f: FormData,
	venue: { id: string; phones: string[]; verifiedPhone: string | null },
	outcome: 'nights' | 'nothing',
	now: Date,
	today: string
) {
	// Question 6 is required on a call that reached them.
	const test = oneOf(ConversationTest, text(f, 'q6'), 'answer to question 6');
	if (!test) throw new Invalid('Ask question 6 first — can people talk in there? It’s the only thing that can produce a Chill night.');
	const register = Q6.find((q) => q.test === test)!.register as Register;
	// Who said it: the venue's own people. A call is never attendance.
	const source: Source = text(f, 'source') === 'OWNER' ? 'OWNER' : 'MANAGER';

	const nights = outcome === 'nights' ? nightsFrom(f, today, { register, dates: 'ahead' }) : [];
	if (outcome === 'nights' && !nights.length) throw new Invalid('Add the night they run — or close the call as “runs nothing”.');

	// Reached on the number dialled: it's verified, and goes first.
	const dialled = text(f, 'dialled');
	const numbers = dialled && venue.phones.some((p) => samePhone(p, dialled)) ? { ...answeredOn(venue.phones, dialled), phoneVerifiedAt: now } : {};

	await prisma.$transaction(async (tx) => {
		// The nights, through the same code as "write up a night out": confirmed by this call.
		await createNights(tx, venue.id, nights, { source, confirmed: { at: now, by: CALLER_NAME } });
		await tx.venue.update({
			where: { id: venue.id },
			data: {
				...numbers,
				conversationTest: test,
				conversationTestAt: now,
				provisionalRegister: register,
				lastContacted: now,
				contactAttempts: 0,
				lastAttemptAt: null,
				// "Runs nothing" is an answer, not a failure: off the discovery list. Nights
				// recorded need nothing more here — their tier and due date are derived from
				// the nights themselves (tier.ts); Venue.tier / nextContactDue are not written.
				...(outcome === 'nothing' ? { noProgramme: true, noProgrammeAt: now } : { noProgramme: false, noProgrammeAt: null })
			}
		});
	});
}
