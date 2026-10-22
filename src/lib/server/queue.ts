// What's owed in a build week: the call round, vouches running out and open
// reminders — loaded once here for the queue screen (/calls) and for the badge
// on every page, so the two can never disagree about what's on it.

import { prisma } from './prisma.js';
import { asDate, isoDate, kampalaDate, loadWeek } from './register.js';
import { reminders } from './reminders.js';
import { addDays, nextMonday } from '#lib/build/week.js';
import { callQueue, owedNow } from '#lib/build/calls.js';
import { vouchRound } from '#lib/build/vouch.js';

export async function loadOwed(week: string, today: string) {
	const weekEnd = addDays(week, 6);

	// Dated rows count from today, so this weekend's gaps are on Thursday's list too.
	const [{ residencies, rows, gate }, occurrences, dueVenues, open] = await Promise.all([
		loadWeek(week),
		prisma.occurrence.findMany({
			where: {
				date: { gte: asDate(today < week ? today : week), lte: asDate(weekEnd) },
				status: { not: 'CANCELLED' }
			}
		}),
		// The cadence, same cut as the Sunday Build's "due a call this week".
		prisma.venue.findMany({
			where: { nextContactDue: { lte: new Date(`${weekEnd}T23:59:59+03:00`) } },
			select: { id: true, lastContacted: true, nextContactDue: true }
		}),
		// Open only, by effective due date. Written by hand, not derived.
		reminders({}, today)
	]);

	const venueIds = new Set([...residencies.map((r) => r.venueId), ...occurrences.map((o) => o.venueId), ...dueVenues.map((v) => v.id)]);
	const venues = await prisma.venue.findMany({
		where: { id: { in: [...venueIds] } },
		select: { id: true, name: true, phone: true, conversationTest: true, zoneName: true, updatedAt: true }
	});

	const organiserIds = [...new Set([...residencies, ...occurrences].map((x) => x.organiserId).filter((x): x is string => !!x))];
	const organisers = await prisma.organiser.findMany({
		where: { id: { in: organiserIds } },
		select: { id: true, name: true, contactName: true, phone: true, whatsapp: true }
	});

	const queue = callQueue(
		week,
		venues.map((v) => ({ ...v, zone: v.zoneName, updatedAt: v.updatedAt.toISOString() })),
		residencies.map((r) => ({
			id: r.id,
			venueId: r.venueId,
			organiserId: r.organiserId,
			bookingPhone: r.bookingPhone,
			bookingPhoneNote: r.bookingPhoneNote,
			eventName: r.eventName,
			category: r.category,
			dayOfWeek: r.dayOfWeek,
			startTime: r.startTime,
			lastConfirmed: kampalaDate(r.lastConfirmed),
			attendedAt: r.attendedAt ? isoDate(r.attendedAt) : null
		})),
		occurrences.map((o) => ({
			id: o.id,
			venueId: o.venueId,
			organiserId: o.organiserId,
			residencyId: o.residencyId,
			bookingPhone: o.bookingPhone,
			bookingPhoneNote: o.bookingPhoneNote,
			date: isoDate(o.date),
			eventName: o.eventName,
			startTime: o.startTime,
			priceGate: o.priceGate,
			register: o.register,
			status: o.status
		})),
		organisers,
		dueVenues.map((v) => ({ venueId: v.id, lastContacted: kampalaDate(v.lastContacted), nextContactDue: kampalaDate(v.nextContactDue)! }))
	);

	return { queue, gate, vouches: vouchRound(rows, week, today), reminders: open };
}

/** The badge on "This week": the default build week's owed-now count. */
export async function owedCount(today: string) {
	const { queue, vouches, reminders } = await loadOwed(nextMonday(today), today);
	return owedNow(queue, vouches.items, reminders, today);
}
