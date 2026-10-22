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
import { savePerks } from '#lib/server/perks.js';
import { lineupFrom, lineupSuggestions, newActsParam, unclassified } from '#lib/server/acts.js';
import { Invalid, failureMessage, money, oneOf, phone, slug, text, time } from '#lib/server/forms.js';
import { kampalaToday, nextMonday } from '#lib/build/week.js';
import { reminders } from '#lib/server/reminders.js';
import { organiserFrom, organiserOptions } from '#lib/server/organisers.js';
import { claimFor, sourceAfter } from '#lib/provenance.js';
import { lineupTransfers } from '#lib/server/provenance.js';
import { whoToCall, type NightContact, type Who } from '#lib/build/who.js';
import type { Actions, PageServerLoad } from './$types';

const editablePerk = (p: { id: string; kind: string; label: string; condition: string | null; activeUntil: Date | null }) => ({
	id: p.id,
	kind: p.kind,
	label: p.label,
	condition: p.condition,
	activeUntil: kampalaDate(p.activeUntil)
});

export const load: PageServerLoad = async ({ params, url }) => {
	const today = kampalaToday();
	const venue = await prisma.venue.findUnique({
		where: { id: params.venueId },
		include: {
			zone: true,
			residencies: {
				where: { active: true },
				orderBy: { dayOfWeek: 'asc' },
				include: { organiser: { select: { id: true, name: true, contactName: true, role: true, phone: true, whatsapp: true } }, perks: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } }
			},
			occurrences: {
				where: { date: { gte: asDate(today) }, status: { not: 'CANCELLED' } },
				orderBy: { date: 'asc' },
				include: { organiser: { select: { id: true, name: true, contactName: true, role: true, phone: true, whatsapp: true } }, perks: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } }
			}
		}
	});
	if (!venue) error(404, 'No such venue');

	// ?ref= is any record's id — a standing night or a dated one here. The older
	// ?residency= / ?occurrence= the queue writes still work.
	const ref = url.searchParams.get('ref');
	const residencyId = url.searchParams.get('residency') ?? (ref && venue.residencies.some((r) => r.id === ref) ? ref : null);
	const occurrenceId = url.searchParams.get('occurrence') ?? (ref && venue.occurrences.some((o) => o.id === ref) ? ref : null);
	const tier = url.searchParams.get('tier');
	// Who this call dials: the venue, the night's organiser, or the number its flyer
	// printed. Unsaid, it's whoever the rule picks for the night it opened on.
	const opened = occurrenceId ? venue.occurrences.find((o) => o.id === occurrenceId) : null;
	const openedWho = opened
		? whoToCall(opened, venue.residencies.find((r) => r.id === opened.residencyId))
		: whoToCall(null, venue.residencies.find((r) => r.id === residencyId));
	const asked = url.searchParams.get('dial');
	const dial = asked === 'venue' || asked === 'organiser' || asked === 'booking' ? asked : ({ VENUE: 'venue', ORGANISER: 'organiser', UNKNOWN: 'booking' } as const)[openedWho.kind];
	const week = url.searchParams.get('week');

	return {
		suggestions: await lineupSuggestions(),
		organisers: await organiserOptions(),
		dial,
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
			lastConfirmed: kampalaDate(r.lastConfirmed),
			runningSince: kampalaDate(r.runningSince),
			lineup: r.lineup,
			organiser: r.organiser,
			organiserId: r.organiserId,
			bookingPhone: r.bookingPhone,
			bookingPhoneNote: r.bookingPhoneNote,
			perks: r.perks.map(editablePerk)
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
			status: o.status,
			organiser: o.organiser,
			organiserId: o.organiserId,
			residencyId: o.residencyId,
			bookingPhone: o.bookingPhone,
			bookingPhoneNote: o.bookingPhoneNote,
			perks: o.perks.map(editablePerk)
		})),
		// Where the queue sent this call.
		mode: occurrenceId ? 'dated' : residencyId ? 'standing' : 'none',
		residencyId: residencyId ?? venue.residencies.find((r) => !r.startTime)?.id ?? venue.residencies[0]?.id ?? null,
		occurrenceId: occurrenceId ?? 'new',
		// A standing night is a monthly sweep; a dated night is this week's problem;
		// a call about no night keeps the venue's own tier (C for a new one).
		tier: CADENCE.some((c) => c.key === tier) ? tier : occurrenceId ? 'C' : residencyId ? 'A' : (venue.tier ?? 'A'),
		// Open reminders for this venue and its nights — in the sidebar while you're on the phone.
		reminders: await reminders({ venue: venue.id }, today)
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

			// The claim is derived from the source and the lineup (claimFor); a posted claimType is ignored.
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

			// The night this call is about, and who the rule says owns it.
			const contact = { organiserId: true, bookingPhone: true, bookingPhoneNote: true } as const;
			const nightId = mode === 'standing' ? text(f, 'residencyId') : mode === 'dated' ? text(f, 'occurrenceId') : null;
			let who: Who = { kind: 'VENUE' };
			let levels: { occurrence?: string; residency?: string } = {};
			if (mode === 'standing' && nightId) {
				const r = await prisma.residency.findFirst({ where: { id: nightId, venueId: venue.id }, select: contact });
				who = whoToCall(null, r);
				levels = { residency: nightId };
			} else if (mode === 'dated' && nightId && nightId !== 'new') {
				const o = await prisma.occurrence.findFirst({
					where: { id: nightId, venueId: venue.id },
					select: { ...contact, residencyId: true, residency: { select: contact } }
				});
				who = whoToCall(o as NightContact | null, o?.residency);
				levels = { occurrence: nightId, residency: o?.residencyId ?? undefined };
			}

			// Who was dialled decides whose cadence moves. Nothing here is automatic:
			// an unknown number is only attributed by the caller saying whose it was.
			const dial = text(f, 'dial') ?? 'venue';
			if (dial === 'organiser' && who.kind !== 'ORGANISER') throw new Invalid('This night has no organiser to have called — log it as a call to the venue.');
			if (dial === 'booking' && who.kind !== 'UNKNOWN') throw new Invalid('This night has no flyer number to have called.');
			const ident = dial === 'booking' && reached ? text(f, 'ident') : null;
			if (dial === 'booking' && reached && !['promoter', 'venue', 'neither'].includes(ident ?? ''))
				throw new Invalid('Say whose number it turned out to be: a promoter, the venue, or neither.');
			const callee: 'venue' | 'organiser' | null =
				dial === 'venue' ? 'venue' : dial === 'organiser' ? 'organiser' : ident === 'promoter' ? 'organiser' : ident === 'venue' ? 'venue' : null;

			const comingUp = text(f, 'comingUp');
			const newPhone = f.has('phone') ? phone(f, 'phone') : venue.phone;
			const phoneChanged = newPhone !== venue.phone;

			await prisma.$transaction(async (tx) => {
				// Identification first: it decides who the rest of the call was with.
				let organiserId = who.kind === 'ORGANISER' ? who.organiserId : null;
				if (who.kind === 'UNKNOWN' && (ident === 'promoter' || ident === 'venue')) {
					const level = who.from === 'occurrence' ? levels.occurrence : levels.residency;
					if (!level) throw new Invalid('Couldn’t find the night that number is on.');
					if (ident === 'promoter') {
						organiserId = (await organiserFrom(tx, f, 'ident', who.phone)) ?? null;
						if (!organiserId) throw new Invalid('Name the promoter — pick them or add them.');
						// The number moves to them: it lives in exactly one place.
						await tx.organiser.update({ where: { id: organiserId }, data: { phone: who.phone } });
					} else {
						await tx.venue.update({ where: { id: venue.id }, data: { phone: who.phone, phoneVerifiedAt: null } });
					}
					const moved = { ...(ident === 'promoter' && { organiserId }), bookingPhone: null, bookingPhoneNote: null };
					if (who.from === 'occurrence') await tx.occurrence.update({ where: { id: level }, data: moved });
					else await tx.residency.update({ where: { id: level }, data: moved });
				}

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
						...(phoneChanged ? { phoneVerifiedAt: null } : reached && venue.phone && dial === 'venue' ? { phoneVerifiedAt: now } : {}),
						...(f.has('phone') && { whatsapp: f.get('whatsapp') === 'on' }),
						...(f.has('bestTime') && { bestTimeToReach: text(f, 'bestTime') }),
						...(callee === 'venue' && { nextContactDue: nextCall }),
						// The cadence chosen applies only to a call that reached them.
						...(reached && callee === 'venue' && { tier: cadence.key }),
						...(reached && callee === 'venue' && { lastContacted: now }),
						// Question 6 is about the room, so only the venue's answer counts.
						...(reached && callee === 'venue' && test && { conversationTest: test, provisionalRegister: register }),
						...(reached && comingUp && {
							notes: [venue.notes, `${today} coming up: ${comingUp}`].filter(Boolean).join('\n')
						})
					}
				});
				if (callee === 'organiser' && organiserId) {
					await tx.organiser.update({
						where: { id: organiserId },
						data: {
							nextContactDue: nextCall,
							...(reached && { lastContacted: now, phoneVerifiedAt: now })
						}
					});
				}
				if (!reached) return;

				// Question 6 classes the room, so every standing night here takes its answer.
				if (register && callee === 'venue') {
					await tx.residency.updateMany({
						where: { venueId: venue.id, active: true },
						data: { register }
					});
				}

				// Question 8 — who to call about this night from now on. Reroutes every future call.
				const q8 = await organiserFrom(tx, f, 'q8');
				const routed = q8 !== undefined ? { organiserId: q8 } : {};

				// What the row will bill decides TRANSFERRED: doubt an act, leave them off the lineup.
				// A call never overwrites attendance (sourceAfter): it moves lastConfirmed, not the vouch.
				const provenance = async (billed: string[], stored: Source | null) => {
					const kept = sourceAfter(stored, source);
					return { source: kept, claimType: claimFor(kept, await lineupTransfers(billed, tx)) };
				};

				if (mode === 'standing') {
					const id = text(f, 'residencyId');
					if (!id) throw new Invalid('Pick the standing night you fixed.');
					const rule = await tx.residency.findFirst({ where: { id, venueId: venue.id }, select: { lineup: true, source: true } });
					if (!rule) throw new Invalid('That standing night isn’t at this venue.');
					const sLineup = lineupFrom(f, 's_lineup');
					await tx.residency.update({
						where: { id, venueId: venue.id },
						data: {
							// Only what the call supplied; a blank field leaves the rule's value alone.
							...(text(f, 's_start') && { startTime: time(f, 's_start', 'Start') }),
							...(text(f, 's_end') && { endTime: time(f, 's_end', 'Wrap') }),
							...(text(f, 's_gate') && { priceGate: money(f, 's_gate', 'Gate price') }),
							...(sLineup?.length && { lineup: sLineup }),
							lastConfirmed: now,
							...routed,
							...(await provenance(sLineup?.length ? sLineup : rule.lineup, rule.source))
						}
					});
					await savePerks(tx, { residencyId: id }, f);
				}

				if (mode === 'dated') {
					const lineup = lineupFrom(f, 'd_lineup') ?? [];
					const existing = text(f, 'occurrenceId');
					const stored =
						existing && existing !== 'new'
							? await tx.occurrence.findFirst({ where: { id: existing, venueId: venue.id }, select: { source: true, residency: { select: { lineup: true } } } })
							: null;
					// An empty lineup shows the standing night's, so the claim is judged on that.
					const standing = lineup.length ? null : stored?.residency;
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
						...routed,
						...(await provenance(lineup.length ? lineup : (standing?.lineup ?? []), stored?.source ?? null))
					};
					if (existing && existing !== 'new') {
						await tx.occurrence.update({ where: { id: existing, venueId: venue.id }, data: fields });
						await savePerks(tx, { occurrenceId: existing }, f);
					} else {
						// Readable ids, like the sheet's: the-silo-daycation-2026-10-25
						let id = `${slug(eventName)}-${date}`;
						if (await tx.occurrence.findUnique({ where: { id } })) id = `${venue.id}-${id}`;
						await tx.occurrence.create({ data: { id, venueId: venue.id, ...fields } });
						await savePerks(tx, { occurrenceId: id }, f);
					}
				}
			});
		} catch (e) {
			const message = failureMessage(e);
			if (message) return fail(400, { error: message });
			console.error(e);
			return fail(500, { error: 'The save failed. Nothing was written.' });
		}

		const billed = text(f, 'outcome') === 'reached' ? [...(lineupFrom(f, 's_lineup') ?? []), ...(lineupFrom(f, 'd_lineup') ?? [])] : [];
		redirect(303, `/calls?week=${isWeek(week) ? week : nextMonday(today)}${newActsParam(await unclassified(billed))}`);
	}
};
