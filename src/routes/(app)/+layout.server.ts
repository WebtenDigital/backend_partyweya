import { mondayOf } from '#lib/build/add.js';
import { kampalaToday } from '#lib/build/week.js';
import type { LayoutServerLoad } from './$types';

// The week containing today, in Kampala — where the logo takes you from any page.
export const load: LayoutServerLoad = () => ({ currentWeek: mondayOf(kampalaToday()) });
