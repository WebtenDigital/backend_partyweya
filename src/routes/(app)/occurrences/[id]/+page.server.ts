import { error, fail } from '@sveltejs/kit';
import { prisma, Category, Register } from '#lib/server/prisma.js';
import { Invalid, failureMessage, money, oneOf, phone, text, time } from '#lib/server/forms.js';
import { organiserFrom, organiserOptions } from '#lib/server/organisers.js';
import { callPanel, whoToCall } from '#lib/build/who.js';
import { savePerks } from '#lib/server/perks.js';
import { lineupFrom, lineupSuggestions, unclassified } from '#lib/server/acts.js';
import { isoDate, kampalaDate } from '#lib/server/register.js';
import { kampalaToday, nextMonday } from '#lib/build/week.js';
import { reminders } from '#lib/server/reminders.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url }) => {
	const o = await prisma.occurrence.findUnique({
		where: { id: params.id },
		include: {
			venue: { select: { id: true, name: true, phone: true, whatsapp: true } },
			organiser: { select: { id: true, name: true, contactName: true, role: true, phone: true, whatsapp: true } },
			residency: {
				select: {
					id: true,
					eventName: true,
					lineup: true,
					organiserId: true,
					bookingPhone: true,
					bookingPhoneNote: true,
					organiser: { select: { id: true, name: true, contactName: true, role: true, phone: true, whatsapp: true } },
					perks: { select: { id: true } }
				}
			},
			perks: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }
		}
	});
	if (!o) error(404, 'No such dated night');
	// This date's own organiser overrides the standing night's, for this date only.
	const who = whoToCall(o, o.residency);
	const organiser = who.kind === 'ORGANISER' ? (who.from === 'occurrence' ? o.organiser : (o.residency?.organiser ?? null)) : null;
	return {
		organisers: await organiserOptions(),
		call: callPanel(who, { id: o.venue.id, name: o.venue.name, phone: o.venue.phone, whatsapp: o.venue.whatsapp }, organiser, o.id),
		suggestions: await lineupSuggestions(),
		today: kampalaToday(),
		week: nextMonday(kampalaToday()),
		justLogged: url.searchParams.get('attended'),
		reminders: await reminders({ occurrence: o.id }),
		occurrence: {
			id: o.id,
			date: isoDate(o.date),
			venue: o.venue,
			organiser: o.organiser,
			residency: o.residency
				? { id: o.residency.id, eventName: o.residency.eventName, lineup: o.residency.lineup, perkCount: o.residency.perks.length, organiser: o.residency.organiser?.name ?? null }
				: null,
			organiserId: o.organiserId,
			bookingPhone: o.bookingPhone,
			bookingPhoneNote: o.bookingPhoneNote,
			eventName: o.eventName,
			category: o.category,
			startTime: o.startTime,
			endTime: o.endTime,
			priceGate: o.priceGate,
			priceAdvance: o.priceAdvance,
			priceNote: o.priceNote,
			lineup: o.lineup,
			register: o.register,
			status: o.status,
			claimType: o.claimType,
			source: o.source,
			confirmedOn: kampalaDate(o.confirmedOn),
			confirmedBy: o.confirmedBy,
			attendedAt: o.attendedAt ? isoDate(o.attendedAt) : null,
			attendedBy: o.attendedBy,
			updatedAt: o.updatedAt.toISOString()
		},
		perks: o.perks.map((p) => ({ id: p.id, kind: p.kind, label: p.label, condition: p.condition, activeUntil: kampalaDate(p.activeUntil) }))
	};
};

export const actions: Actions = {
	// The record, not a call: status, claim and confirmation stay as they are.
	save: async ({ params, request }) => {
		const f = await request.formData();
		try {
			const eventName = text(f, 'eventName');
			if (!eventName) throw new Invalid('The night needs its name.');
			const seen = text(f, 'updatedAt');
			if (!seen) throw new Invalid('Reload the page and try again.');
			const lineup = lineupFrom(f);
			const bookingPhone = phone(f, 'bookingPhone');
			await prisma.$transaction(async (tx) => {
				const organiserId = await organiserFrom(tx, f, 'org');
				const { count } = await tx.occurrence.updateMany({
					where: { id: params.id, updatedAt: new Date(seen) },
					data: {
						eventName,
						category: oneOf(Category, text(f, 'category'), 'category') ?? 'OTHER',
						startTime: time(f, 'startTime', 'Start'),
						endTime: time(f, 'endTime', 'Wrap'),
						priceGate: money(f, 'priceGate', 'Gate price'),
						priceAdvance: money(f, 'priceAdvance', 'Advance price'),
						priceNote: text(f, 'priceNote'),
						...(lineup !== undefined && { lineup }),
						register: oneOf(Register, text(f, 'register'), 'register'),
						...(organiserId !== undefined && { organiserId }),
						bookingPhone,
						bookingPhoneNote: bookingPhone ? text(f, 'bookingPhoneNote') : null
					}
				});
				if (count === 0) throw new Invalid('This night changed since you loaded the page — reload to see the latest.');
				await savePerks(tx, { occurrenceId: params.id }, f);
			});
		} catch (e) {
			const message = failureMessage(e);
			if (message) return fail(400, { error: message });
			console.error(e);
			return fail(500, { error: 'The save failed. Nothing was written.' });
		}
		return { saved: true, newNames: await unclassified(lineupFrom(f) ?? []) };
	}
};
