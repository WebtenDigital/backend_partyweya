import { fail, redirect } from '@sveltejs/kit';
import { prisma, Register } from '#lib/server/prisma.js';
import { isWeek, loadWeek } from '#lib/server/register.js';
import { addDays, kampalaToday, nextMonday, shortDate } from '#lib/build/week.js';
import { unclassified } from '#lib/server/acts.js';
import { reminders } from '#lib/server/reminders.js';
import { dialNumber } from '#lib/phones.js';
import { attendanceTarget, vouchRound } from '#lib/build/vouch.js';
import { derivedCadence, loadDiscovery, nightCoverage } from '#lib/server/queue.js';
import { changeVisit, dismissVisit, planVisit, visitsDue, weekVisit } from '#lib/server/visits.js';
import { failureMessage, oneOf, text } from '#lib/server/forms.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const today = kampalaToday();
	const week = url.searchParams.get('week');
	if (!isWeek(week)) redirect(307, `/build?week=${nextMonday(today)}`);

	const [{ weekEnd, rows, gate }, due, stats] = await Promise.all([
		loadWeek(week),
		// Derived from the nights (tier.ts), never Venue.nextContactDue — the same cadence as /calls.
		derivedCadence(today, addDays(week, 6)),
		Promise.all([
			prisma.venue.count(),
			prisma.residency.groupBy({ by: ['venueId'], where: { active: true } }),
			prisma.residency.count({ where: { active: true } }),
			prisma.residency.count({ where: { active: true, register: 'CHILL' } }),
			prisma.venue.count({ where: { conversationTest: { not: null } } })
		])
	]);

	// Due a call this week: each venue's most urgent night, by its derived tier.
	// Not this week's gaps — that's a separate list.
	const dueVenues = await prisma.venue.findMany({
		where: { id: { in: due.map((d) => d.venueId) } },
		select: { id: true, name: true, phones: true, verifiedPhone: true }
	});
	const byId = new Map(dueVenues.map((v) => [v.id, v]));
	const REASON = {
		A: (d: (typeof due)[number]) => `Tier A · monthly sweep · last confirmed ${shortDate(d.lastConfirmed!)}`,
		B: (d: (typeof due)[number]) => `Tier B · weekly check · last confirmed ${shortDate(d.lastConfirmed!)}`,
		C: () => 'Tier C · a night never confirmed'
	};
	const calls = due
		.filter((d) => byId.has(d.venueId))
		.map((d) => ({ id: d.venueId, venue: byId.get(d.venueId)!.name, phone: dialNumber(byId.get(d.venueId)!), reasons: [REASON[d.tier](d)] }));

	const [venueCount, standingVenues, standingNights, chillNights, tested] = stats;
	const newActs = await unclassified((url.searchParams.get('newacts') ?? '').split('|').filter(Boolean));
	// Open reminders on the week's nights, shown on their rows.
	const nightReminders = await reminders({
		ids: {
			residencies: [...new Set(rows.map((r) => r.residencyId).filter((x): x is string => !!x))],
			occurrences: rows.filter((r) => r.kind !== 'STANDING').map((r) => r.key)
		}
	});

	const attendance = attendanceTarget(rows, today);
	return {
		reminders: nightReminders,
		newActs,
		week,
		weekEnd,
		today,
		rows,
		gate,
		// Where Friday's attendance goes (Rule F4), and the vouches that need a visit.
		// Read-only: the panel plans visits, it never writes or calls.
		attendance,
		// The week's one planned visit, if it stands — so the rail shows the decision,
		// not a fresh list as though nothing had been decided.
		visit: await weekVisit(week),
		// The target register's nights this week, to plan (or re-point) the visit at.
		visitNights: rows
			.filter((r) => r.register === attendance.target)
			.map((r) => ({
				ref: r.kind === 'STANDING' ? r.residencyId! : r.key,
				date: r.date,
				eventName: r.eventName,
				venue: r.venue.name,
				startTime: r.startTime
			})),
		// A past planned visit never written up: Sunday is when that silence costs.
		unwritten: await visitsDue(today),
		// What we can actually publish from, not how many venues are on file.
		coverage: { ...(await nightCoverage()), backlog: (await loadDiscovery(today)).total },
		vouches: vouchRound(rows, week, today).items,
		calls: [...calls.values()].sort((a, b) => a.venue.localeCompare(b.venue)),
		supply: {
			venues: venueCount,
			standingVenues: standingVenues.length,
			standingNights,
			chillNights,
			tested
		}
	};
};

const failed = (e: unknown) => {
	const message = failureMessage(e);
	if (message) return fail(400, { visitError: message });
	console.error(e);
	return fail(500, { visitError: 'Not saved. Nothing was written.' });
};

export const actions: Actions = {
	// Plan the week's visit at a night. One a week: refused while one stands.
	plan: async ({ request }) => {
		const f = await request.formData();
		try {
			await planVisit(prisma, { ref: text(f, 'ref') ?? '', date: text(f, 'date') ?? '', register: oneOf(Register, text(f, 'register'), 'register') });
		} catch (e) {
			return failed(e);
		}
		return { planned: true };
	},
	// Re-point the standing visit — the same visit, never a second.
	change: async ({ request }) => {
		const f = await request.formData();
		try {
			await changeVisit(prisma, text(f, 'id') ?? '', { ref: text(f, 'ref') ?? '', date: text(f, 'date') ?? '' });
		} catch (e) {
			return failed(e);
		}
		return { planned: true };
	},
	// "It never happened": one tap, no friction, no write-up.
	dismiss: async ({ request }) => {
		const f = await request.formData();
		try {
			await dismissVisit(prisma, text(f, 'id') ?? '');
		} catch (e) {
			return failed(e);
		}
		return { dismissed: true };
	}
};
