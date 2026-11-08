import { mondayOf } from '#lib/build/add.js';
import { kampalaToday } from '#lib/build/week.js';
import { owedCount } from '#lib/server/queue.js';
import { visitsDue } from '#lib/server/visits.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async () => {
	const today = kampalaToday();
	const [owedNow, unwritten] = await Promise.all([owedCount(today), visitsDue(today)]);
	return {
		// The week containing today, in Kampala — where the logo takes you from any page.
		currentWeek: mondayOf(today),
		// The "This week" badge: only what is blocking or overdue right now.
		owedNow,
		// The "Visits" badge: a planned visit that's past and not written up. One a week,
		// so 0 or 1 — a 1 on Tuesday means Friday never got written up.
		visitsDue: unwritten.length
	};
};
