import { fail, redirect } from '@sveltejs/kit';
import { CALLER_NAME } from '$app/env/private';
import { prisma, Category, Register } from '#lib/server/prisma.js';
import { Invalid, failureMessage, money, oneOf, slug, text, time } from '#lib/server/forms.js';
import { asDate, kampalaDate } from '#lib/server/register.js';
import { PROVENANCE, REPEATS, isoDay, mondayOf, nextOn, type Repeat } from '#lib/build/add.js';
import { kampalaToday } from '#lib/build/week.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const [venues, residencies, zones] = await Promise.all([
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
				priceGate: true,
				register: true,
				runningSince: true
			}
		}),
		prisma.zone.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } })
	]);

	return {
		caller: CALLER_NAME,
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
			// The source decides the claim. No form can produce VETTED.
			if (f.has('vetted') || f.has('claimType')) throw new Invalid('The claim comes from the source; it can’t be set here.');
			const claimType = prov.claim;
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
					let id = slug(name);
					if (!id) throw new Invalid('The venue needs a name with letters in it.');
					if (await tx.venue.findUnique({ where: { id } })) id = `${id}-${Date.now().toString(36)}`;
					await tx.venue.create({
						data: { id, name, location: text(f, 'new_location'), zoneName: text(f, 'new_zone') }
					});
					venueId = id;
				}
				if (prov.key === 'attended') {
					await tx.venue.update({ where: { id: venueId }, data: { lastAttended: now } });
				}

				const confirmation = {
					claimType,
					source: source as never
				};
				const startTime = time(f, 'start', 'Start');
				const endTime = time(f, 'end', 'Wrap');
				const priceGate = money(f, 'gate', 'Gate price');
				const register = oneOf(Register, text(f, 'register'), 'register');

				// 3 · the answer to "does it repeat?" picks the table.
				if (repeat === 'weekly') {
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

					const data = {
						eventName,
						category,
						dayOfWeek: day,
						startTime,
						endTime,
						priceGate,
						register,
						active: true,
						...(running && { runningSince: asDate(`${running}-01`) }),
						lastConfirmed: confirmed ? now : null,
						...confirmation
					};
					const existing =
						f.get('duplicate') !== 'separate'
							? await tx.residency.findFirst({
									where: { venueId, active: true, eventName: { equals: eventName, mode: 'insensitive' } }
								})
							: null;
					let id: string;
					if (existing) {
						id = existing.id;
						await tx.residency.update({ where: { id }, data });
					} else {
						id = `${venueId}-${slug(eventName)}`;
						if (await tx.residency.findUnique({ where: { id } })) id = `${id}-${day}`;
						await tx.residency.create({ data: { id, venueId, ...data } });
					}
					const date = nextOn(today, day);
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
								priceGate,
								priceAdvance: money(f, 'advance', 'Advance price'),
								register,
								status: confirmed ? ('CONFIRMED' as const) : ('LEAD' as const)
							};
				const fields = {
					...data,
					...confirmation,
					residencyId: residency?.id ?? null,
					confirmedOn: confirmed ? now : null,
					confirmedBy: confirmed ? CALLER_NAME : null
				};

				const existing = await tx.occurrence.findUnique({
					where: { venueId_date_eventName: { venueId, date: asDate(date), eventName } }
				});
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
				return { week: mondayOf(date), highlight: repeat === 'cancelled' ? null : id };
			});
		} catch (e) {
			const message = failureMessage(e);
			if (message) return fail(400, { error: message });
			console.error(e);
			return fail(500, { error: 'The save failed. Nothing was written.' });
		}

		redirect(
			303,
			`/build?week=${landing.week}${landing.highlight ? `&highlight=${encodeURIComponent(landing.highlight)}` : ''}`
		);
	}
};
