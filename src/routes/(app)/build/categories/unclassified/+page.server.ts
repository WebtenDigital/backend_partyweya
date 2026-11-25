import { unclassifiedNights } from '#lib/server/categories.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({ nights: await unclassifiedNights() });
