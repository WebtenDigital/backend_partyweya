import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// The Sunday build is the app's front page for now.
export const load: PageServerLoad = () => {
	redirect(307, '/build');
};
