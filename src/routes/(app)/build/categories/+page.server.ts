import { redirect } from '@sveltejs/kit';
import { isWeek, loadWeek } from '#lib/server/register.js';
import { standingCounts } from '#lib/server/categories.js';
import { CATEGORIES, weekCounts } from '#lib/build/categories.js';
import { kampalaToday, nextMonday } from '#lib/build/week.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const week = url.searchParams.get('week');
	if (!isWeek(week)) redirect(307, `/build/categories?week=${nextMonday(kampalaToday())}`);
	const [{ weekEnd, rows }, standing] = await Promise.all([loadWeek(week), standingCounts()]);
	const nights = weekCounts(rows);
	return {
		week,
		weekEnd,
		// Every category, zeros included: a zero says the supply isn't there yet.
		categories: CATEGORIES.map((c) => ({ key: c, standing: standing.total[c], asked: standing.asked[c], nights: nights[c] })),
		themed: standing.total.THEMED_NIGHT,
		asked: Object.values(standing.asked).reduce((a, n) => a + n, 0),
		total: Object.values(standing.total).reduce((a, n) => a + n, 0)
	};
};
