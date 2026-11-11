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
import type { ClaimType } from '#lib/server/prisma.js';
import type { Tx } from '#lib/server/db.js';
import { asDate, isWeek, isoDate, kampalaDate } from '#lib/server/register.js';
import { Q6 } from '#lib/build/calls.js';
import { addPerks, parsePerks, savePerks } from '#lib/server/perks.js';
import { lineupFrom, lineupSuggestions, newActsParam, unclassified } from '#lib/server/acts.js';
import { Invalid, failureMessage, money, oneOf, phoneList, slug, text, time } from '#lib/server/forms.js';
import { answeredOn, dialNumber, samePhone, withPhones } from '#lib/phones.js';
import { addDays, kampalaToday, nextMonday } from '#lib/build/week.js';
import { reminders } from '#lib/server/reminders.js';
import { describeVenueTier, type Night } from '#lib/server/tier.js';
import { organiserFrom, organiserOptions } from '#lib/server/organisers.js';
import { claimFor, sourceAfter } from '#lib/provenance.js';
import { lineupTransfers } from '#lib/server/provenance.js';
import { whoToCall, type NightContact, type Who } from '#lib/build/who.js';
import type { Actions, PageServerLoad } from './$types';

const editablePerk = (p: { id: string; kind: string; label: string; condition: string | null; activeUntil: Date | null; confirmedOn: Date | null }) => ({
	id: p.id,
	kind: p.kind,
	label: p.label,
	condition: p.condition,
	activeUntil: kampalaDate(p.activeUntil),
	confirmedOn: kampalaDate(p.confirmedOn)
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
			phone: dialNumber(venue), //  what this call dials: the answered number, else the first
			phones: venue.phones,
			verifiedPhone: venue.verifiedPhone,
			whatsapp: venue.whatsapp,
			bestTimeToReach: venue.bestTimeToReach,
			conversationTest: venue.conversationTest,
			provisionalRegister: venue.provisionalRegister,
			register: venue.register, //  judged in the room — only a write-up sets it
			registerJudgedAt: kampalaDate(venue.registerJudgedAt),
			lastContacted: kampalaDate(venue.lastContacted),
			lastAttended: kampalaDate(venue.lastAttended),
			// Venue-level, derived: does any night here clear? (The verdict is per night.)
			clearsF2: [...venue.residencies, ...venue.occurrences].some((x) => x.clearsF2 === true)
				? true
				: [...venue.residencies, ...venue.occurrences].some((x) => x.clearsF2 === false)
					? false
					: null,
			paidClient: venue.paidClient
		},
		residencies: venue.residencies.map((r) => ({
			id: r.id,
			eventName: r.eventName,
			category: r.category,
			categoryAskedAt: kampalaDate(r.categoryAskedAt),
			dayOfWeek: r.dayOfWeek,
			startTime: r.startTime,
			endTime: r.endTime,
			priceGate: r.priceGate,
			priceAdvance: r.priceAdvance,
			register: r.register,
			attendedAt: r.attendedAt ? isoDate(r.attendedAt) : null,
			source: r.source,
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
		// What the system concluded from the nights, and why — shown, never set here (tier.ts).
		tier: describeVenueTier(
			[
				...venue.residencies.map(
					(r): Night => ({ kind: 'standing', lastConfirmed: kampalaDate(r.lastConfirmed), runningSince: kampalaDate(r.runningSince), firstConfirmedAt: kampalaDate(r.firstConfirmedAt) })
				),
				...venue.occurrences.filter((o) => !o.residencyId).map((o): Night => ({ kind: 'one-off', date: isoDate(o.date), confirmed: o.status === 'CONFIRMED' }))
			],
			today
		),
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
			// A venue's cadence is derived from its nights (tier.ts) — nothing here sets one.
			// An organiser's has its own column: a month for a standing night, a week for a
			// dated one; no answer or call back, try again tomorrow.
			const organiserNext = new Date(now.getTime() + (reached ? (mode === 'dated' ? 7 : 28) : 1) * 86_400_000);

			const venue = await prisma.venue.findUnique({
				where: { id: params.venueId },
				select: { id: true, notes: true, phones: true, verifiedPhone: true }
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
			// The venue's numbers: edited on the call if the field was, then — reached on the
			// number actually dialled — that one is verified and goes to the front.
			let numbers: { phones: string[]; verifiedPhone: string | null; phoneVerifiedAt?: Date | null } = f.has('phone')
				? withPhones(venue, phoneList(f, 'phone'))
				: { phones: venue.phones, verifiedPhone: venue.verifiedPhone };
			const dialled = text(f, 'dialled');
			if (reached && dial === 'venue' && dialled && numbers.phones.some((p) => samePhone(p, dialled)))
				numbers = { ...answeredOn(numbers.phones, dialled), phoneVerifiedAt: now };

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
						// Their number now, tried first; nobody has answered it as the venue's yet.
						const phones = [who.phone, ...venue.phones.filter((p) => !samePhone(p, who.phone))];
						await tx.venue.update({ where: { id: venue.id }, data: withPhones(venue, phones) });
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
						...numbers,
						...(f.has('phone') && { whatsapp: f.get('whatsapp') === 'on' }),
						...(f.has('bestTime') && { bestTimeToReach: text(f, 'bestTime') }),
						// No answer counts toward unreachable; anyone picking up (even "call back") resets it.
						...(callee === 'venue' && { contactAttempts: outcome === 'no-answer' ? { increment: 1 } : 0 }),
						...(reached && callee === 'venue' && { lastContacted: now }),
						// Question 6 is about the room, so only the venue's answer counts.
						// It updates the GUESS and when it was made; a judged register (Venue.register) is untouched.
						...(reached && callee === 'venue' && test && { conversationTest: test, provisionalRegister: register, conversationTestAt: now }),
						...(reached && comingUp && {
							notes: [venue.notes, `${today} coming up: ${comingUp}`].filter(Boolean).join('\n')
						})
					}
				});
				if (callee === 'organiser' && organiserId) {
					await tx.organiser.update({
						where: { id: organiserId },
						data: {
							nextContactDue: organiserNext,
							...(reached && { lastContacted: now, phoneVerifiedAt: now })
						}
					});
				}
				if (!reached) return;

				// Question 6 classes the room, so every standing night here takes its answer —
				// except one we have stood in: the room's judgement outranks a phone answer.
				if (register && callee === 'venue') {
					await tx.residency.updateMany({
						where: { venueId: venue.id, active: true, attendedAt: null },
						data: { register }
					});
				}
				// An offer heard on this call is confirmed by it — its own date, not the night's.
				const heard = { at: now, by: CALLER_NAME };
				const offers = parsePerks(f);

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
					const rule = await tx.residency.findFirst({
						where: { id, venueId: venue.id },
						select: { lineup: true, source: true, priceGate: true, priceAdvance: true, dayOfWeek: true, eventName: true, category: true }
					});
					if (!rule) throw new Invalid('That standing night isn’t at this venue.');
					const sLineup = lineupFrom(f, 's_lineup');
					const gate = text(f, 's_gate') ? money(f, 's_gate', 'Gate price') : rule.priceGate;
					const advance = text(f, 's_advance') ? money(f, 's_advance', 'Advance price') : rule.priceAdvance;
					if (gate != null && advance != null && advance >= gate) throw new Invalid('The advance price has to be cheaper than the gate — or it isn’t an advance price.');
					// Question 5, asked only while the category is still an inference.
					const category = oneOf(Category, text(f, 's_category'), 'category');
					await tx.residency.update({
						where: { id, venueId: venue.id },
						data: {
							// Only what the call supplied; a blank field leaves the rule's value alone.
							...(text(f, 's_start') && { startTime: time(f, 's_start', 'Start') }),
							...(text(f, 's_end') && { endTime: time(f, 's_end', 'Wrap') }),
							...(text(f, 's_gate') && { priceGate: gate }),
							...(text(f, 's_advance') && { priceAdvance: advance }),
							...(category && { category, categoryAskedAt: now }),
							...(sLineup?.length && { lineup: sLineup }),
							// Question 4: how long has it been running? Skippable; the month, as discovery takes it.
							...(/^\d{4}-\d{2}$/.test(text(f, 's_since') ?? '') && { runningSince: new Date(`${text(f, 's_since')}-01T00:00:00+03:00`) }),
							// firstConfirmedAt is set by the database the first time this is written, never after.
							lastConfirmed: now,
							...routed,
							...(await provenance(sLineup?.length ? sLineup : rule.lineup, rule.source))
						}
					});
					// "Every week, or just this one?" Weekly offers are the rule's; a one-off goes on
					// this week's date of it — never the other way round.
					if (offers) {
						await savePerks(tx, { residencyId: id }, offers.filter((p) => p.scope !== 'once'), heard);
						const once = offers.filter((p) => p.scope === 'once');
						if (once.length) {
							const date = addDays(isWeek(week) ? week : nextMonday(today), rule.dayOfWeek - 1);
							const after = await tx.residency.findUniqueOrThrow({ where: { id }, select: { source: true, claimType: true } });
							const occurrenceId = await thisDate(tx, { residencyId: id, venueId: venue.id, date, eventName: rule.eventName, category: category ?? rule.category, ...after }, now);
							await addPerks(tx, { occurrenceId }, once, heard);
						}
					}
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
						const o = await tx.occurrence.update({ where: { id: existing, venueId: venue.id }, data: fields, select: { residencyId: true } });
						// On a standing night's date, an offer can be every week's — then it's the rule's.
						const weekly = o.residencyId ? (offers ?? []).filter((p) => p.scope === 'weekly') : [];
						await savePerks(tx, { occurrenceId: existing }, offers && offers.filter((p) => !weekly.includes(p)), heard);
						if (weekly.length) await addPerks(tx, { residencyId: o.residencyId! }, weekly, heard);
					} else {
						// Readable ids, like the sheet's: the-silo-daycation-2026-10-25
						let id = `${slug(eventName)}-${date}`;
						if (await tx.occurrence.findUnique({ where: { id } })) id = `${venue.id}-${id}`;
						await tx.occurrence.create({ data: { id, venueId: venue.id, ...fields } });
						await savePerks(tx, { occurrenceId: id }, offers, heard);
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

/**
 * The dated row for one date of a standing night, for an offer that holds that
 * date only. Usually it already exists; otherwise an override carrying nothing
 * of its own — every blank field falls through to the rule (buildWeek) — and
 * confirmed by this call, as the rule just was, so the date doesn't drop to
 * unconfirmed for want of a row.
 */
async function thisDate(
	tx: Tx,
	n: { residencyId: string; venueId: string; date: string; eventName: string; category: Category; source: Source | null; claimType: ClaimType | null },
	now: Date
) {
	const found = await tx.occurrence.findFirst({ where: { residencyId: n.residencyId, date: asDate(n.date) }, select: { id: true } });
	if (found) return found.id;
	let id = `${n.residencyId}-${n.date}`;
	if (await tx.occurrence.findUnique({ where: { id } })) id = `${id}-offer`;
	await tx.occurrence.create({
		data: {
			id,
			venueId: n.venueId,
			residencyId: n.residencyId,
			date: asDate(n.date),
			eventName: n.eventName,
			category: n.category,
			source: n.source,
			claimType: n.claimType,
			status: 'CONFIRMED',
			confirmedOn: now,
			confirmedBy: CALLER_NAME
		}
	});
	return id;
}
