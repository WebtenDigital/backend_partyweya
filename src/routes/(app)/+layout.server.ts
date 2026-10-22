import { mondayOf } from '#lib/build/add.js';
import { kampalaToday } from '#lib/build/week.js';
import { owedCount } from '#lib/server/queue.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async () => {
	const today = kampalaToday();
	return {
		// The week containing today, in Kampala — where the logo takes you from any page.
		currentWeek: mondayOf(today),
		// The "This week" badge: only what is blocking or overdue right now.
		owedNow: await owedCount(today)
	};
};
