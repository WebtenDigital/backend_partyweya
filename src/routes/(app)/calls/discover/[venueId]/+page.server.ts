import { error, fail, redirect } from '@sveltejs/kit';
import { CALLER_NAME } from '$app/env/private';
import { prisma, Category, ConversationTest, Register, type Source } from '#lib/server/prisma.js';
import { Invalid, failureMessage, money, oneOf, slug, text, time } from '#lib/server/forms.js';
import { asDate } from '#lib/server/register.js';
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

const RECURRENCES = [
	{ key: 'WEEKLY', label: 'Weekly' },
	{ key: 'MONTHLY', label: 'Monthly' },
	{ key: 'SEASONAL', label: 'Seasonal' },
	{ key: 'ONE_OFF', label: 'One-off' }
] as const;

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

type Night = {
	eventName: string;
	category: Category;
	recurrence: (typeof RECURRENCES)[number]['key'];
	dayOfWeek: number | null;
	date: string | null;
	startTime: string;
	endTime: string | null;
	priceGate: number | null;
	priceAdvance: number | null;
	runningSince: string | null;
	lineup: string[];
	register: Register;
};

const NIGHT_FIELDS = ['name', 'category', 'recurrence', 'day', 'date', 'start', 'end', 'gate', 'advance', 'since', 'lineup', 'register'];

/** The repeated night blocks, posted as n_name, n_start, … once per block, in order. */
function nightsFrom(f: FormData, today: string, venueRegister: Register): Night[] {
	const blocks = f.getAll('n_name').map((_, i) => {
		const night = new FormData();
		for (const k of NIGHT_FIELDS) night.set(k, String(f.getAll(`n_${k}`)[i] ?? ''));
		return night;
	});
	// A block left completely empty is just an unused "add another night".
	const filled = blocks.filter((b) => NIGHT_FIELDS.some((k) => k !== 'recurrence' && k !== 'category' && k !== 'register' && text(b, k)));
	return filled.map((b, n) => {
		const at = filled.length > 1 ? ` (night ${n + 1})` : '';
		const eventName = text(b, 'name');
		if (!eventName) throw new Invalid(`What’s the night called${at}?`);
		const category = oneOf(Category, text(b, 'category'), 'category');
		if (!category) throw new Invalid(`What kind of night is it${at}?`);
		const recurrence = RECURRENCES.find((r) => r.key === text(b, 'recurrence'))?.key;
		if (!recurrence) throw new Invalid(`How often does it run${at}?`);
		// A row without a start time is not a row.
		const startTime = time(b, 'start', `Start${at}`);
		if (!startTime) throw new Invalid(`What time does it start${at}? A night without a start time can’t be recorded.`);
		const standing = recurrence !== 'ONE_OFF';
		const day = Number(text(b, 'day'));
		if (standing && !(day >= 1 && day <= 7)) throw new Invalid(`Which day of the week${at}?`);
		const date = text(b, 'date');
		if (!standing && !(date && /^\d{4}-\d{2}-\d{2}$/.test(date))) throw new Invalid(`Which date${at}?`);
		if (!standing && date! < today) throw new Invalid(`That date has passed${at}.`);
		const since = text(b, 'since') ?? '';
		return {
			eventName,
			category,
			recurrence,
			dayOfWeek: standing ? day : null,
			date: standing ? null : date,
			startTime,
			endTime: time(b, 'end', `Wrap${at}`),
			priceGate: money(b, 'gate', `Gate price${at}`),
			// A standing night's fee is set once; only a dated row carries an advance price.
			priceAdvance: standing ? null : money(b, 'advance', `Advance price${at}`),
			runningSince: standing && /^\d{4}-\d{2}$/.test(since) ? `${since}-01` : null,
			lineup: (text(b, 'lineup') ?? '')
				.split(/[,;]/)
				.map((s) => s.trim())
				.filter(Boolean),
			// Question 6 sets the venue's register; a night can say otherwise.
			register: oneOf(Register, text(b, 'register'), 'register') ?? venueRegister
		};
	});
}

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

	const nights = outcome === 'nights' ? nightsFrom(f, today, register) : [];
	if (outcome === 'nights' && !nights.length) throw new Invalid('Add the night they run — or close the call as “runs nothing”.');

	// Reached on the number dialled: it's verified, and goes first.
	const dialled = text(f, 'dialled');
	const numbers = dialled && venue.phones.some((p) => samePhone(p, dialled)) ? { ...answeredOn(venue.phones, dialled), phoneVerifiedAt: now } : {};

	await prisma.$transaction(async (tx) => {
		for (const n of nights) {
			const common = {
				venueId: venue.id,
				eventName: n.eventName,
				category: n.category,
				startTime: n.startTime,
				endTime: n.endTime,
				priceGate: n.priceGate,
				register: n.register,
				lineup: n.lineup,
				source,
				claimType: 'FACTUAL' as const
			};
			if (n.recurrence === 'ONE_OFF') {
				let id = `${slug(n.eventName)}-${n.date}`;
				if (await tx.occurrence.findUnique({ where: { id } })) id = `${venue.id}-${id}`;
				await tx.occurrence.create({
					data: {
						...common,
						id,
						date: asDate(n.date!),
						priceAdvance: n.priceAdvance,
						status: 'CONFIRMED',
						confirmedOn: now,
						confirmedBy: CALLER_NAME
					}
				});
			} else {
				let id = `${venue.id}-${slug(n.eventName)}`;
				if (await tx.residency.findUnique({ where: { id } })) id = `${id}-${n.dayOfWeek}`;
				await tx.residency.create({
					data: {
						...common,
						id,
						dayOfWeek: n.dayOfWeek!,
						recurrence: n.recurrence,
						runningSince: n.runningSince ? new Date(`${n.runningSince}T00:00:00+03:00`) : null,
						lastConfirmed: now
					}
				});
			}
		}
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
