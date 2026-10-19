import { redirect } from '@sveltejs/kit';
import { prisma } from '#lib/server/prisma.js';
import { asDate, isWeek, isoDate, kampalaDate, loadWeek } from '#lib/server/register.js';
import { addDays, kampalaToday, nextMonday } from '#lib/build/week.js';
import { callQueue } from '#lib/build/calls.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const today = kampalaToday();
	const week = url.searchParams.get('week');
	if (!isWeek(week)) redirect(307, `/calls?week=${nextMonday(today)}`);
	const weekEnd = addDays(week, 6);

	// Dated rows count from today, so this weekend's gaps are on Thursday's list too.
	const [{ residencies, gate }, occurrences, venueCount, numbers] = await Promise.all([
		loadWeek(week),
		prisma.occurrence.findMany({
			where: {
				date: { gte: asDate(today < week ? today : week), lte: asDate(weekEnd) },
				status: { not: 'CANCELLED' }
			}
		}),
		prisma.venue.count(),
		prisma.venue.count({ where: { phone: { not: null } } })
	]);

	const venueIds = new Set([...residencies.map((r) => r.venueId), ...occurrences.map((o) => o.venueId)]);
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
			eventName: r.eventName,
			category: r.category,
			dayOfWeek: r.dayOfWeek,
			startTime: r.startTime,
			lastConfirmed: kampalaDate(r.lastConfirmed)
		})),
		occurrences.map((o) => ({
			id: o.id,
			venueId: o.venueId,
			organiserId: o.organiserId,
			date: isoDate(o.date),
			eventName: o.eventName,
			startTime: o.startTime,
			priceGate: o.priceGate,
			register: o.register,
			status: o.status
		})),
		organisers
	);

	return { week, today, queue, gate, register: { venues: venueCount, numbers } };
};
