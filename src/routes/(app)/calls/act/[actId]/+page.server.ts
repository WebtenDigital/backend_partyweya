import { error, fail, redirect } from '@sveltejs/kit';
import { CALLER_NAME } from '$app/env/private';
import { prisma, type Category } from '#lib/server/prisma.js';
import { asDate, kampalaDate } from '#lib/server/register.js';
import { CADENCE } from '#lib/build/calls.js';
import { Invalid, failureMessage, slug, text } from '#lib/server/forms.js';
import { claimFor } from '#lib/provenance.js';
import { lineupTransfers } from '#lib/server/provenance.js';
import { kampalaToday, nextMonday } from '#lib/build/week.js';
import type { Actions, PageServerLoad } from './$types';

// What a night billing this act is, when nobody says otherwise.
const CATEGORY: Record<string, Category> = { BAND: 'LIVE_BAND', DJ: 'DJ', COMEDIAN: 'COMEDY', POET: 'POETRY', ACOUSTIC_ACT: 'ACOUSTIC' };

export const load: PageServerLoad = async ({ params }) => {
	const [act, venues] = await Promise.all([
		prisma.act.findUnique({ where: { id: params.actId } }),
		prisma.venue.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } })
	]);
	if (!act) error(404, 'No such act');
	return {
		caller: CALLER_NAME,
		today: kampalaToday(),
		act: {
			id: act.id,
			name: act.name,
			contactName: act.contactName,
			phone: act.phone,
			whatsapp: act.whatsapp,
			bestTimeToReach: act.bestTimeToReach,
			lastContacted: kampalaDate(act.lastContacted)
		},
		venues
	};
};

export const actions: Actions = {
	// A prospective call: the act names gigs they're booked for. Each one is a
	// fact from the performer — source ACT, CONFIRMED, its claim derived (an act
	// that transfers makes it TRANSFERRED: the bill is the credibility) — even without a
	// start time, which the call round then chases ("blocks this week").
	save: async ({ params, request }) => {
		const f = await request.formData();
		const now = new Date();
		const today = kampalaToday(now);
		try {
			const outcome = text(f, 'outcome');
			if (!outcome || !['reached', 'no-answer', 'call-back'].includes(outcome))
				throw new Invalid('Say how the call went: reached them, no answer, or call back.');
			const reached = outcome === 'reached';
			const cadence = CADENCE.find((c) => c.key === text(f, 'cadence')) ?? CADENCE[1];
			const nextCall = new Date(now);
			nextCall.setDate(nextCall.getDate() + (reached ? cadence.days : 1));

			const act = await prisma.act.findUnique({ where: { id: params.actId } });
			if (!act) throw new Invalid('No such act.');

			const col = (k: string) => f.getAll(k).map((v) => String(v).trim());
			const [dates, venueNames, names, billings] = [col('g_date'), col('g_venue'), col('g_name'), col('g_billing')];
			const gigs = dates
				.map((date, i) => ({ date, venue: venueNames[i] ?? '', eventName: names[i] ?? '', billing: billings[i] ?? '' }))
				.filter((g) => g.date || g.venue || g.eventName);
			if (!reached && gigs.length) throw new Invalid('You didn’t reach them, so there’s nothing they told you to log. Clear the gigs, or mark it reached.');
			gigs.forEach((g, i) => {
				const n = gigs.length > 1 ? ` (gig ${i + 1})` : '';
				if (!/^\d{4}-\d{2}-\d{2}$/.test(g.date)) throw new Invalid(`Which date${n}?`);
				if (g.date < today) throw new Invalid(`That date has passed${n} — this call is about what’s coming up.`);
				if (!g.venue) throw new Invalid(`Where is it${n}? Pick the venue, or type a new one.`);
				if (!g.eventName) throw new Invalid(`What’s the night called${n}?`);
			});

			await prisma.$transaction(async (tx) => {
				await tx.act.update({
					where: { id: act.id },
					data: {
						nextContactDue: nextCall,
						...(reached && { lastContacted: now }),
						...(reached && act.phone && { phoneVerifiedAt: now })
					}
				});
				for (const g of gigs) {
					// Venue: an existing one by name, or added here — they often play rooms the register hasn't heard of.
					let venue = await tx.venue.findFirst({ where: { name: { equals: g.venue, mode: 'insensitive' } }, select: { id: true } });
					if (!venue) {
						let id = slug(g.venue);
						if (!id) throw new Invalid('The venue needs a name with letters in it.');
						if (await tx.venue.findUnique({ where: { id } })) id = `${id}-${Date.now().toString(36)}`;
						venue = await tx.venue.create({ data: { id, name: g.venue }, select: { id: true } });
					}
					if (await tx.occurrence.findUnique({ where: { venueId_date_eventName: { venueId: venue.id, date: asDate(g.date), eventName: g.eventName } } }))
						throw new Invalid(`${g.eventName} at ${g.venue} on ${g.date} is already in the register.`);
					const lineup = (g.billing || act.name).split(',').map((n) => n.trim()).filter(Boolean);
					let id = `${slug(g.eventName)}-${g.date}`;
					if (await tx.occurrence.findUnique({ where: { id } })) id = `${venue.id}-${id}`;
					await tx.occurrence.create({
						data: {
							id,
							venueId: venue.id,
							date: asDate(g.date),
							eventName: g.eventName,
							category: (act.role && CATEGORY[act.role]) || 'OTHER',
							lineup,
							source: 'ACT',
							claimType: claimFor('ACT', await lineupTransfers(lineup, tx)),
							status: 'CONFIRMED',
							confirmedOn: now,
							confirmedBy: CALLER_NAME
						}
					});
				}
			});
		} catch (e) {
			const message = failureMessage(e);
			if (message) return fail(400, { error: message });
			console.error(e);
			return fail(500, { error: 'The save failed. Nothing was written.' });
		}
		redirect(303, `/calls?week=${nextMonday(today)}`);
	}
};
