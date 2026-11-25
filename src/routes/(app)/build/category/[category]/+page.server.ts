import { error, redirect } from '@sveltejs/kit';
import { isWeek, loadWeek } from '#lib/server/register.js';
import { standingCounts } from '#lib/server/categories.js';
import { isCategory, listing, type Mode } from '#lib/build/categories.js';
import { kampalaToday, nextMonday } from '#lib/build/week.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url }) => {
	if (!isCategory(params.category)) error(404, 'No such category');
	const week = url.searchParams.get('week');
	// THIS WEEK by default: everything that runs, one-offs and overrides included.
	const mode: Mode = url.searchParams.get('mode') === 'standing' ? 'standing' : 'week';
	if (!isWeek(week)) redirect(307, `/build/category/${params.category}?week=${nextMonday(kampalaToday())}${mode === 'standing' ? '&mode=standing' : ''}`);
	// The Sunday Build's own expansion — standing nights alone in STANDING ONLY, so an
	// override never stands in for the rule it overrides.
	const [{ weekEnd, rows }, standing] = await Promise.all([loadWeek(week, undefined, { standingOnly: mode === 'standing' }), standingCounts()]);
	return {
		category: params.category,
		week,
		weekEnd,
		mode,
		listing: listing(rows, params.category, week, mode),
		// How far the page can be believed: categories said, not inferred — and the nights that may belong here.
		confidence: { asked: standing.asked[params.category], total: standing.total[params.category], themed: standing.total.THEMED_NIGHT }
	};
};
