import { error, fail, redirect } from '@sveltejs/kit';
import { CALLER_NAME } from '$app/env/private';
import {
	prisma,
	Category,
	ContactRole,
	ConversationTest,
	Register,
	Source
} from '#lib/server/prisma.js';
import { asDate, isWeek, isoDate, kampalaDate } from '#lib/server/register.js';
import { CADENCE, Q6 } from '#lib/build/calls.js';
import { Invalid, failureMessage, money, oneOf, phone, slug, text, time } from '#lib/server/forms.js';
import { kampalaToday, nextMonday } from '#lib/build/week.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url }) => {
	const today = kampalaToday();
	const venue = await prisma.venue.findUnique({
		where: { id: params.venueId },
		include: {
			zone: true,
			residencies: { where: { active: true }, orderBy: { dayOfWeek: 'asc' } },
			occurrences: {
				where: { date: { gte: asDate(today) }, status: { not: 'CANCELLED' } },
				orderBy: { date: 'asc' }
			}
		}
	});
	if (!venue) error(404, 'No such venue');

	const residencyId = url.searchParams.get('residency');
	const occurrenceId = url.searchParams.get('occurrence');
	const week = url.searchParams.get('week');

	return {
		caller: CALLER_NAME,
		week: isWeek(week) ? week : nextMonday(today),
		today,
		venue: {
			id: venue.id,
			name: venue.name,
			location: venue.location,
			zone: venue.zone?.name ?? null,
			division: venue.zone?.division ?? null,
			contactName: venue.contactName,
			contactRole: venue.contactRole,
			phone: venue.phone,
			whatsapp: venue.whatsapp,
			bestTimeToReach: venue.bestTimeToReach,
			conversationTest: venue.conversationTest,
			provisionalRegister: venue.provisionalRegister,
			lastContacted: kampalaDate(venue.lastContacted),
			lastAttended: kampalaDate(venue.lastAttended),
			clearsF2: venue.clearsF2,
			paidClient: venue.paidClient
		},
		residencies: venue.residencies.map((r) => ({
			id: r.id,
			eventName: r.eventName,
			dayOfWeek: r.dayOfWeek,
			startTime: r.startTime,
			endTime: r.endTime,
			priceGate: r.priceGate,
			register: r.register,
			lastConfirmed: kampalaDate(r.lastConfirmed)
		})),
		occurrences: venue.occurrences.map((o) => ({
			id: o.id,
			date: isoDate(o.date),
			eventName: o.eventName,
			category: o.category,
			startTime: o.startTime,
			endTime: o.endTime,
			priceGate: o.priceGate,
			priceAdvance: o.priceAdvance,
			priceNote: o.priceNote,
			lineup: o.lineup,
			register: o.register,
			status: o.status
		})),
		// Where the queue sent this call.
		mode: occurrenceId ? 'dated' : residencyId ? 'standing' : 'none',
		residencyId: residencyId ?? venue.residencies.find((r) => !r.startTime)?.id ?? venue.residencies[0]?.id ?? null,
		occurrenceId: occurrenceId ?? 'new'
	};
};

export const actions: Actions = {
	save: async ({ params, request }) => {
		const f = await request.formData();
		const now = new Date();
		const today = kampalaToday(now);
		const week = text(f, 'week');

		try {
			const outcome = text(f, 'outcome');
			if (!outcome || !['reached', 'no-answer', 'call-back'].includes(outcome))
				throw new Invalid('Say how the call went: reached them, no answer, or call back.');
			const reached = outcome === 'reached';
			const mode = text(f, 'mode') ?? 'none';

			const claimType = text(f, 'claimType') ?? 'FACTUAL';
			if (claimType === 'VETTED') throw new Invalid('VETTED needs attendance; a call cannot carry it.');
			if (!['FACTUAL', 'TRANSFERRED'].includes(claimType)) throw new Invalid(`Unknown claim: ${claimType}`);
			const source = oneOf(Source, text(f, 'source'), 'source') ?? 'OWNER';
			if (source === 'ATTENDED') throw new Invalid('A call is not attendance.');

			const test = oneOf(ConversationTest, text(f, 'q6'), 'answer to question 6');
			const register = test ? Q6.find((q) => q.test === test)!.register : null;
			const cadence = CADENCE.find((c) => c.key === text(f, 'cadence')) ?? CADENCE[0];
			const nextCall = new Date(now);
			// Reached: the cadence. No answer or call back: try again tomorrow.
			nextCall.setDate(nextCall.getDate() + (reached ? cadence.days : 1));

			const venue = await prisma.venue.findUnique({
				where: { id: params.venueId },
				select: { id: true, notes: true, phone: true }
			});
			if (!venue) throw new Invalid('No such venue');

			const comingUp = text(f, 'comingUp');
			const newPhone = f.has('phone') ? phone(f, 'phone') : venue.phone;
			const phoneChanged = newPhone !== venue.phone;
			const confirmed = { claimType: claimType as 'FACTUAL' | 'TRANSFERRED', source };

			await prisma.$transaction(async (tx) => {
				// Contact details save whatever happened — finding a number is progress.
				await tx.venue.update({
					where: { id: venue.id },
					data: {
						// Only fields the form sent, so a partial post never blanks the rest.
						...(f.has('contactName') && { contactName: text(f, 'contactName') }),
						...(f.has('contactRole') && { contactRole: oneOf(ContactRole, text(f, 'contactRole'), 'role') }),
						...(f.has('phone') && { phone: newPhone }),
						// Reached on the number on file: it's verified. A number changed during the
						// call hasn't been answered yet, so it starts unverified.
						...(phoneChanged ? { phoneVerifiedAt: null } : reached && venue.phone ? { phoneVerifiedAt: now } : {}),
						...(f.has('phone') && { whatsapp: f.get('whatsapp') === 'on' }),
						...(f.has('bestTime') && { bestTimeToReach: text(f, 'bestTime') }),
						nextContactDue: nextCall,
						...(reached && { lastContacted: now }),
						...(reached && test && { conversationTest: test, provisionalRegister: register }),
						...(reached && comingUp && {
							notes: [venue.notes, `${today} coming up: ${comingUp}`].filter(Boolean).join('\n')
						})
					}
				});
				if (!reached) return;

				// Question 6 classes the room, so every standing night here takes its answer.
				if (register) {
					await tx.residency.updateMany({
						where: { venueId: venue.id, active: true },
						data: { register }
					});
				}

				if (mode === 'standing') {
					const id = text(f, 'residencyId');
					if (!id) throw new Invalid('Pick the standing night you fixed.');
					if (claimType === 'TRANSFERRED')
						throw new Invalid('TRANSFERRED rests on a named lineup; standing nights don’t carry one.');
					await tx.residency.update({
						where: { id, venueId: venue.id },
						data: {
							// Only what the call supplied; a blank field leaves the rule's value alone.
							...(text(f, 's_start') && { startTime: time(f, 's_start', 'Start') }),
							...(text(f, 's_end') && { endTime: time(f, 's_end', 'Wrap') }),
							...(text(f, 's_gate') && { priceGate: money(f, 's_gate', 'Gate price') }),
							lastConfirmed: now,
							...confirmed
						}
					});
				}

				if (mode === 'dated') {
					const lineup = text(f, 'd_lineup');
					if (claimType === 'TRANSFERRED' && !lineup)
						throw new Invalid('TRANSFERRED rests on a named lineup — enter who’s playing.');
					const date = text(f, 'd_date');
					const eventName = text(f, 'd_name');
					if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Invalid('A dated night needs its date.');
					if (!eventName) throw new Invalid('A dated night needs its name.');
					const fields = {
						date: asDate(date),
						eventName,
						category: oneOf(Category, text(f, 'd_category'), 'category') ?? 'OTHER',
						startTime: time(f, 'd_start', 'Start'),
						endTime: time(f, 'd_end', 'Wrap'),
						priceGate: money(f, 'd_gate', 'Gate price'),
						priceAdvance: money(f, 'd_advance', 'Advance price'),
						priceNote: text(f, 'd_note'),
						lineup,
						register: oneOf(Register, text(f, 'd_register'), 'register'),
						status: 'CONFIRMED' as const,
						confirmedOn: now,
						confirmedBy: CALLER_NAME,
						...confirmed
					};
					const existing = text(f, 'occurrenceId');
					if (existing && existing !== 'new') {
						await tx.occurrence.update({ where: { id: existing, venueId: venue.id }, data: fields });
					} else {
						// Readable ids, like the sheet's: the-silo-daycation-2026-10-25
						let id = `${slug(eventName)}-${date}`;
						if (await tx.occurrence.findUnique({ where: { id } })) id = `${venue.id}-${id}`;
						await tx.occurrence.create({ data: { id, venueId: venue.id, ...fields } });
					}
				}
			});
		} catch (e) {
			const message = failureMessage(e);
			if (message) return fail(400, { error: message });
			console.error(e);
			return fail(500, { error: 'The save failed. Nothing was written.' });
		}

		redirect(303, `/calls?week=${isWeek(week) ? week : nextMonday(today)}`);
	}
};
