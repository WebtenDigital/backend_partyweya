import { fail, redirect } from '@sveltejs/kit';
import { CALLER_NAME } from '$app/env/private';
import { prisma, Category, MonthlyOrdinal, Register } from '#lib/server/prisma.js';
import { addPerks } from '#lib/server/perks.js';
import { parsePrices, savePrices } from '#lib/server/price.js';
import { lineupFrom, lineupSuggestions, newActsParam, unclassified } from '#lib/server/acts.js';
import { Invalid, failureMessage, oneOf, phone, slug, text, time } from '#lib/server/forms.js';
import { organiserFrom, organiserOptions } from '#lib/server/organisers.js';
import { claimFor, sourceAfter } from '#lib/provenance.js';
import { billedLineup, lineupTransfers, ruleBills } from '#lib/server/provenance.js';
import { createVenue } from '#lib/server/venues.js';
import type { Source } from '#lib/server/prisma.js';
import { asDate, kampalaDate } from '#lib/server/register.js';
import { placeOn } from '#lib/build/recurrence.js';
import { DAYS, PROVENANCE, REPEATS, STANDING_REPEATS, isoDay, mondayOf, nextOn, type Repeat } from '#lib/build/add.js';
import { addDays, kampalaToday } from '#lib/build/week.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const [venues, residencies, zones, suggestions, organisers] = await Promise.all([
		prisma.venue.findMany({
			orderBy: { name: 'asc' },
			select: {
				id: true,
				name: true,
				location: true,
				conversationTest: true,
				zone: { select: { name: true, division: true } }
			}
		}),
		prisma.residency.findMany({
			where: { active: true },
			orderBy: { dayOfWeek: 'asc' },
			select: {
				id: true,
				venueId: true,
				eventName: true,
				category: true,
				dayOfWeek: true,
				startTime: true,
				endTime: true,
				register: true,
				lineup: true,
				runningSince: true
			}
		}),
		prisma.zone.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
		lineupSuggestions(),
		organiserOptions()
	]);

	return {
		caller: CALLER_NAME,
		suggestions,
		organisers,
		today: kampalaToday(),
		venueId: url.searchParams.get('venue'),
		venues: venues.map((v) => ({
			id: v.id,
			name: v.name,
			location: v.location,
			zone: v.zone?.name ?? null,
			division: v.zone?.division ?? null,
			tested: v.conversationTest != null
		})),
		residencies: residencies.map((r) => ({ ...r, runningSince: kampalaDate(r.runningSince)?.slice(0, 7) ?? null })),
		zones: zones.map((z) => ({ name: z.name, division: z.division }))
	};
};

export const actions: Actions = {
	save: async ({ request }) => {
		const f = await request.formData();
		const now = new Date();
		const today = kampalaToday(now);
		let landing: { week: string; highlight: string | null };

		try {
			// 5 · provenance first: it decides what everything else may claim.
			const prov = PROVENANCE.find((p) => p.key === text(f, 'provenance'));
			if (!prov) throw new Invalid('Say where this came from — there is no default.');
			const source = text(f, 'source') ?? prov.sources[0].key;
			if (!prov.sources.some((s) => s.key === source)) throw new Invalid('That source doesn’t match the answer.');
			// The source decides the claim, through claimFor(). No form can set it.
			if (f.has('vetted') || f.has('claimType')) throw new Invalid('The claim comes from the source; it can’t be set here.');
			const confirmed = prov.confirms;

			const repeat = REPEATS.find((r) => r.key === text(f, 'repeat'))?.key as Repeat | undefined;
			if (!repeat) throw new Invalid('Say whether it repeats.');

			landing = await prisma.$transaction(async (tx) => {
				// 1 · where
				let venueId = text(f, 'venueId');
				if (venueId) {
					if (!(await tx.venue.findUnique({ where: { id: venueId } }))) throw new Invalid('That venue isn’t in the register.');
				} else {
					const name = text(f, 'new_name');
					if (!name) throw new Invalid('Pick the venue, or add it — nothing can be saved without one.');
					venueId = (await createVenue(tx, { name, location: text(f, 'new_location'), zoneName: text(f, 'new_zone') })).id;
				}
				if (prov.key === 'attended') {
					await tx.venue.update({ where: { id: venueId }, data: { lastAttended: now } });
				}

				// Derived from the source and the lineup the row will actually bill, in this transaction.
				// Merging into a night already attended keeps the attendance (sourceAfter).
				const provenance = async (billed: string[], stored: Source | null = null) => {
					const kept = sourceAfter(stored, source as Source);
					return { source: kept, claimType: claimFor(kept, await lineupTransfers(billed, tx)) };
				};
				const startTime = time(f, 'start', 'Start');
				const endTime = time(f, 'end', 'Wrap');
				// Prices from the flyer replace the night's when any are given; none given keeps them.
				const prices = parsePrices(f);
				const putPrices = (parent: { residencyId: string } | { occurrenceId: string }) => (prices?.length ? savePrices(tx, parent, prices) : null);
				const register = oneOf(Register, text(f, 'register'), 'register');
				// The act: overwritten on a merge only when one is given.
				const lineup = lineupFrom(f) ?? [];
				// Routing, internal: who runs it — only when a promoter or agent told you, and only
				// if you say so (they sometimes pass on nights that aren't theirs) — and the flyer's number.
				const organiserId = source === 'PROMOTER' || source === 'AGENT' ? await organiserFrom(tx, f, 'who') : undefined;
				const bookingPhone = phone(f, 'bookingPhone');
				const routing = {
					...(organiserId && { organiserId }),
					...(bookingPhone && { bookingPhone, bookingPhoneNote: text(f, 'bookingPhoneNote') })
				};

				// 3 · the answer to "does it repeat?" picks the table.
				if (STANDING_REPEATS.includes(repeat)) {
					const eventName = text(f, 'eventName');
					const category = oneOf(Category, text(f, 'category'), 'category');
					const day = Number(text(f, 'day'));
					if (!eventName) throw new Invalid('Give it a name, as they brand it.');
					if (!category) throw new Invalid('Pick a category.');
					if (!(day >= 1 && day <= 7)) throw new Invalid('Which night of the week?');
					if (!register)
						throw new Invalid('A standing night needs a register — your best guess, until question 6 makes it a fact.');
					const running = text(f, 'runningSince');
					if (running && !/^\d{4}-\d{2}$/.test(running)) throw new Invalid('How long it’s been running: a month, like 2025-03.');
					// A rule that can't be placed is not saved: every other week from WHEN, which Friday of the month.
					const anchor = repeat === 'fortnightly' ? text(f, 'anchorDate') : null;
					if (repeat === 'fortnightly') {
						if (!anchor || !/^\d{4}-\d{2}-\d{2}$/.test(anchor)) throw new Invalid('Every other week from when? Give a date it actually ran.');
						if (isoDay(anchor) !== day) throw new Invalid(`That date is a ${DAYS[isoDay(anchor)]} — give a ${DAYS[day]} it actually ran.`);
					}
					const ordinal = repeat === 'monthly' ? oneOf(MonthlyOrdinal, text(f, 'monthlyOrdinal'), 'which week of the month') : null;
					if (repeat === 'monthly' && !ordinal) throw new Invalid('Which one of the month — first, second, third, fourth or last?');

					const data = {
						eventName,
						category,
						dayOfWeek: day,
						recurrence: ({ weekly: 'WEEKLY', fortnightly: 'FORTNIGHTLY', monthly: 'MONTHLY' } as const)[repeat as 'weekly' | 'fortnightly' | 'monthly'],
						anchorDate: anchor ? asDate(anchor) : null,
						monthlyOrdinal: ordinal,
						startTime,
						endTime,
						register,
						active: true,
						...(lineup.length && { lineup }),
						...(running && { runningSince: asDate(`${running}-01`) }),
						lastConfirmed: confirmed ? now : null,
						...routing
					};
					const existing =
						f.get('duplicate') !== 'separate'
							? await tx.residency.findFirst({
									where: { venueId, active: true, eventName: { equals: eventName, mode: 'insensitive' } }
								})
							: null;
					// A merge with no act given keeps the night's existing one — and is judged on it.
					// "Different act every week" is recorded when said; a merge that doesn't say leaves it as it was.
					const rotatingAct = f.get('rotating') === '1' || (existing?.rotatingAct ?? false);
					Object.assign(data, { rotatingAct }, await provenance(ruleBills({ lineup: lineup.length ? lineup : (existing?.lineup ?? []), rotatingAct }), existing?.source));
					let id: string;
					if (existing) {
						id = existing.id;
						await tx.residency.update({ where: { id }, data });
					} else {
						id = `${venueId}-${slug(eventName)}`;
						if (await tx.residency.findUnique({ where: { id } })) id = `${id}-${day}`;
						await tx.residency.create({ data: { id, venueId, ...data } });
					}
					await putPrices({ residencyId: id });
					// Offers are added, never replaced — in the same transaction as the night.
					await addPerks(tx, { residencyId: id }, f);
					// The next date the rule actually runs — an off-week of a fortnightly night isn't it.
					let date = nextOn(today, day);
					const rule = { recurrence: data.recurrence, anchorDate: anchor, monthlyOrdinal: ordinal };
					for (let i = 0; i < 6 && 'on' in placeOn(rule, date) && !(placeOn(rule, date) as { on: boolean }).on; i++) date = addDays(date, 7);
					return { week: mondayOf(date), highlight: `${id}|${date}` };
				}

				// Dated rows.
				const date = text(f, 'date');
				if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Invalid('Which date?');

				let residency = null;
				if (repeat === 'override' || repeat === 'cancelled') {
					residency = await tx.residency.findFirst({ where: { id: text(f, 'residencyId') ?? '', venueId } });
					if (!residency) throw new Invalid('Pick the standing night this replaces.');
					if (isoDay(date) !== residency.dayOfWeek)
						throw new Invalid(`${residency.eventName} is on ${['', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'][residency.dayOfWeek]} — pick a date that falls on one.`);
				}

				const eventName = text(f, 'eventName') ?? residency?.eventName;
				const category = oneOf(Category, text(f, 'category'), 'category') ?? residency?.category;
				if (!eventName) throw new Invalid('Give it a name, as they brand it.');
				if (!category) throw new Invalid('Pick a category.');

				const data =
					repeat === 'cancelled'
						? { status: 'CANCELLED' as const }
						: {
								category,
								startTime,
								endTime,
								register,
								...(lineup.length && { lineup }),
								...routing,
								status: confirmed ? ('CONFIRMED' as const) : ('LEAD' as const)
							};
				const existing = await tx.occurrence.findUnique({
					where: { venueId_date_eventName: { venueId, date: asDate(date), eventName } }
				});
				// An empty lineup shows the standing night's, so that's what the claim is judged on —
				// as the database's TRANSFERRED check judges it.
				const billed = lineup.length ? lineup : existing?.lineup.length ? existing.lineup : billedLineup([], residency);
				const fields = {
					...data,
					...(await provenance(billed, existing?.source)),
					residencyId: residency?.id ?? null,
					confirmedOn: confirmed ? now : null,
					confirmedBy: confirmed ? CALLER_NAME : null
				};
				let id: string;
				if (existing) {
					id = existing.id;
					await tx.occurrence.update({ where: { id }, data: fields });
				} else {
					id = `${slug(eventName)}-${date}`;
					if (await tx.occurrence.findUnique({ where: { id } })) id = `${venueId}-${id}`;
					await tx.occurrence.create({
						data: { id, venueId, date: asDate(date), eventName, category, ...fields }
					});
				}
				// A cancellation publishes nothing, so it carries no act or offers.
				if (repeat !== 'cancelled') {
					await putPrices({ occurrenceId: id });
					await addPerks(tx, { occurrenceId: id }, f);
				}
				return { week: mondayOf(date), highlight: repeat === 'cancelled' ? null : id };
			});
		} catch (e) {
			const message = failureMessage(e);
			if (message) return fail(400, { error: message });
			console.error(e);
			return fail(500, { error: 'The save failed. Nothing was written.' });
		}

		const fresh = text(f, 'repeat') === 'cancelled' ? [] : await unclassified(lineupFrom(f) ?? []);
		redirect(
			303,
			`/build?week=${landing.week}${landing.highlight ? `&highlight=${encodeURIComponent(landing.highlight)}` : ''}${newActsParam(fresh)}`
		);
	}
};
