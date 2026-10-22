import { redirect } from '@sveltejs/kit';
import { prisma } from '#lib/server/prisma.js';
import { isWeek } from '#lib/server/register.js';
import { kampalaToday, nextMonday } from '#lib/build/week.js';
import { SORT_COOKIE } from '#lib/build/calls.js';
import { loadOwed } from '#lib/server/queue.js';
import { unclassified } from '#lib/server/acts.js';
import { reminderHealth, subjects } from '#lib/server/reminders.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, cookies }) => {
	const today = kampalaToday();
	const week = url.searchParams.get('week');
	if (!isWeek(week)) redirect(307, `/calls?week=${nextMonday(today)}`);

	const [{ queue, gate, vouches, reminders: open }, venueCount, numbers, subjectList] = await Promise.all([
		loadOwed(week, today),
		prisma.venue.count(),
		prisma.venue.count({ where: { phones: { isEmpty: false } } }),
		subjects()
	]);

	const newActs = await unclassified((url.searchParams.get('newacts') ?? '').split('|').filter(Boolean));
	const health = await reminderHealth(open, today);

	return {
		newActs,
		week,
		today,
		queue,
		gate,
		vouches,
		register: { venues: venueCount, numbers },
		reminders: open,
		health,
		subjects: subjectList,
		// Remembered across visits: the app has one user, so the browser is the user.
		sort: cookies.get(SORT_COOKIE) === 'date' ? ('date' as const) : ('type' as const)
	};
};
