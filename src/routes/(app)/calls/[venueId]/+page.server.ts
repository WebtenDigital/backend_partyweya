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

// ── form parsing ─────────────────────────────────────────────────────────

class Invalid extends Error {}

const TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const text = (f: FormData, k: string) => {
	const v = f.get(k);
	return typeof v === 'string' && v.trim() ? v.trim() : null;
};
const time = (f: FormData, k: string, label: string) => {
	const v = text(f, k);
	if (v && !TIME.test(v)) throw new Invalid(`${label} must be 24-hour, like 21:00`);
	return v;
};
const money = (f: FormData, k: string, label: string) => {
	const v = text(f, k);
	if (v == null) return null;
	const n = Number(v.replace(/[,\s]/g, ''));
	if (!Number.isInteger(n) || n < 0) throw new Invalid(`${label} must be a whole number of shillings`);
	return n;
};
const oneOf = <T extends string>(values: Record<string, T>, v: string | null, label: string) => {
	if (v == null) return null;
	if (!Object.values(values).includes(v as T)) throw new Invalid(`Unknown ${label}: ${v}`);
	return v as T;
};
const slug = (s: string) =>
	s
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');

// What a database guard means, in the caller's words.
const CONSTRAINTS: Record<string, string> = {
	advance_cheaper_than_gate: 'The advance price has to be cheaper than the gate price.',
	vetted_means_attended: 'VETTED needs attendance; a call cannot carry it.',
	residency_vetted_means_attended: 'VETTED needs attendance; a call cannot carry it.',
	Occurrence_venueId_date_eventName_key: 'This venue already has a night with that name on that date.'
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
			nextCall.setDate(nextCall.getDate() + (reached ? cadence.days : outcome === 'call-back' ? 1 : 2));

			const venue = await prisma.venue.findUnique({
				where: { id: params.venueId },
				select: { id: true, notes: true }
			});
			if (!venue) throw new Invalid('No such venue');

			const comingUp = text(f, 'comingUp');
			const confirmed = { claimType: claimType as 'FACTUAL' | 'TRANSFERRED', source };

			await prisma.$transaction(async (tx) => {
				// Contact details save whatever happened — finding a number is progress.
				await tx.venue.update({
					where: { id: venue.id },
					data: {
						// Only fields the form sent, so a partial post never blanks the rest.
						...(f.has('contactName') && { contactName: text(f, 'contactName') }),
						...(f.has('contactRole') && { contactRole: oneOf(ContactRole, text(f, 'contactRole'), 'role') }),
						...(f.has('phone') && { phone: text(f, 'phone') }),
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
							startTime: time(f, 's_start', 'Start'),
							endTime: time(f, 's_end', 'Wrap'),
							priceGate: money(f, 's_gate', 'Gate price'),
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
			if (e instanceof Invalid) return fail(400, { error: e.message });
			const msg = String((e as Error)?.message ?? e);
			const known = Object.keys(CONSTRAINTS).find((c) => msg.includes(c));
			if (known) return fail(400, { error: CONSTRAINTS[known] });
			console.error(e);
			return fail(500, { error: 'The save failed. Nothing was written.' });
		}

		redirect(303, `/calls?week=${isWeek(week) ? week : nextMonday(today)}`);
	}
};
