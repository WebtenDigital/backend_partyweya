import { error, fail, redirect } from '@sveltejs/kit';
import { prisma, ConversationTest, Register } from '#lib/server/prisma.js';
import { Invalid, failureMessage, oneOf, text } from '#lib/server/forms.js';
import { asDate, isoDate, kampalaDate } from '#lib/server/register.js';
import { claimFor } from '#lib/provenance.js';
import { lineupTransfers } from '#lib/server/provenance.js';
import { Q6 } from '#lib/build/calls.js';
import { isoDay } from '#lib/build/add.js';
import { addDays, kampalaToday } from '#lib/build/week.js';
import type { Actions, PageServerLoad } from './$types';

// "I was here": a vouch that someone stood in the room and formed a judgement.
// Not a call — it never touches lastContacted or nextContactDue, so the night
// stays on Thursday's call round: only the venue knows whether next week is off.

const venueSelect = { id: true, name: true, conversationTest: true, notes: true, lastAttended: true } as const;

async function night(ref: string) {
	const r = await prisma.residency.findUnique({ where: { id: ref }, include: { venue: { select: venueSelect } } });
	if (r) return { kind: 'residency' as const, r };
	const o = await prisma.occurrence.findUnique({
		where: { id: ref },
		include: { venue: { select: venueSelect }, residency: { select: { lineup: true, register: true } } }
	});
	if (o) return { kind: 'occurrence' as const, o };
	return null;
}

/** The most recent date on or before `today` that falls on ISO weekday `dow`. */
const lastOn = (today: string, dow: number) => addDays(today, -((isoDay(today) - dow + 7) % 7));

export const load: PageServerLoad = async ({ params }) => {
	const n = await night(params.ref);
	if (!n) error(404, 'No such night');
	const today = kampalaToday();
	const row = n.kind === 'residency' ? n.r : n.o;
	return {
		today,
		night: {
			kind: n.kind,
			id: row.id,
			eventName: row.eventName,
			venue: { id: row.venue.id, name: row.venue.name },
			conversationTest: row.venue.conversationTest,
			register: row.register ?? (n.kind === 'occurrence' ? (n.o.residency?.register ?? null) : null),
			dayOfWeek: n.kind === 'residency' ? n.r.dayOfWeek : null,
			// A residency defaults to the last night it ran; a dated row is its own date, fixed.
			date: n.kind === 'residency' ? lastOn(today, n.r.dayOfWeek) : isoDate(n.o.date),
			attendedAt: row.attendedAt ? isoDate(row.attendedAt) : null,
			attendedBy: row.attendedBy,
			record: n.kind === 'residency' ? `/residencies/${row.id}` : `/occurrences/${row.id}`
		}
	};
};

export const actions: Actions = {
	save: async ({ params, request }) => {
		const f = await request.formData();
		const today = kampalaToday();
		let back: string;
		try {
			const n = await night(params.ref);
			if (!n) throw new Invalid('That night is no longer in the register.');

			// Every field is required, here and not only in the browser: someone who was
			// there knows all of it; someone who wasn't has to invent it.
			const date = n.kind === 'occurrence' ? isoDate(n.o.date) : text(f, 'date');
			if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Invalid('Which night were you there?');
			if (date > today) throw new Invalid(n.kind === 'occurrence' ? 'This night hasn’t happened yet.' : 'That date hasn’t happened yet.');
			if (n.kind === 'residency' && isoDay(date) !== n.r.dayOfWeek)
				throw new Invalid(`${n.r.eventName} runs on ${['', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'][n.r.dayOfWeek]} — pick the night you were there.`);
			const test = oneOf(ConversationTest, text(f, 'q6'), 'answer to question 6');
			if (!test) throw new Invalid('Question 6: could you talk? You heard the room.');
			const register = oneOf(Register, text(f, 'register'), 'register');
			if (!register) throw new Invalid('Which register was it?');
			const differed = text(f, 'differed');
			if (differed !== 'matched' && differed !== 'differed') throw new Invalid('Did it match the record, or did something differ?');
			const note = text(f, 'note');
			if (differed === 'differed' && !note) throw new Invalid('Say what differed.');
			const initials = text(f, 'initials')?.toUpperCase();
			if (!initials) throw new Invalid('Your initials — who stood in the room.');
			if (!/^[A-Z][A-Z .'-]{1,23}$/.test(initials)) throw new Invalid('Initials: letters, like RM.');

			const at = asDate(date);
			const row = n.kind === 'residency' ? n.r : n.o;
			const stamp = `${date} attended (${initials})${n.kind === 'occurrence' ? ` ${n.o.eventName}` : ''} — differed: ${note}`;
			// Logging an older visit after a newer call or visit never moves either date backwards.
			const later = (current: Date | null) => !current || kampalaDate(current)! < date;
			const billed = n.kind === 'residency' ? n.r.lineup : n.o.lineup.length ? n.o.lineup : (n.o.residency?.lineup ?? []);

			await prisma.$transaction(async (tx) => {
				const vouch = {
					source: 'ATTENDED' as const,
					claimType: claimFor('ATTENDED', await lineupTransfers(billed, tx)),
					attendedAt: at,
					attendedBy: initials,
					register
				};
				if (n.kind === 'residency') {
					await tx.residency.update({
						where: { id: row.id },
						data: {
							...vouch,
							...(later(n.r.lastConfirmed) && { lastConfirmed: at }),
							...(differed === 'differed' && { notes: [n.r.notes, stamp].filter(Boolean).join('\n') })
						}
					});
				} else {
					await tx.occurrence.update({
						where: { id: row.id },
						data: { ...vouch, ...(later(n.o.confirmedOn) && { confirmedOn: at, confirmedBy: initials }) }
					});
				}
				// The room itself: question 6 heard first-hand supersedes a manager's answer.
				// A dated night has no notes of its own, so what differed goes on the venue's.
				await tx.venue.update({
					where: { id: row.venue.id },
					data: {
						conversationTest: test,
						provisionalRegister: Q6.find((q) => q.test === test)!.register,
						...(later(row.venue.lastAttended) && { lastAttended: at }),
						...(n.kind === 'occurrence' && differed === 'differed' && { notes: [row.venue.notes, stamp].filter(Boolean).join('\n') })
					}
				});
			});
			back = `${n.kind === 'residency' ? `/residencies/${row.id}` : `/occurrences/${row.id}`}?attended=${date}`;
		} catch (e) {
			const message = failureMessage(e);
			if (message) return fail(400, { error: message });
			console.error(e);
			return fail(500, { error: 'The save failed. Nothing was written.' });
		}
		redirect(303, back);
	}
};
