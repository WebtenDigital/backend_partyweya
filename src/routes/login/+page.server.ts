import { fail, redirect } from '@sveltejs/kit';
import { checkPassword, endSession, startSession } from '#lib/server/auth.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.authed) redirect(303, '/');
};

export const actions: Actions = {
	login: async ({ request, cookies }) => {
		const password = (await request.formData()).get('password');
		if (typeof password !== 'string' || !checkPassword(password)) {
			return fail(401, { wrong: true });
		}
		startSession(cookies);
		redirect(303, '/');
	},
	logout: ({ cookies }) => {
		endSession(cookies);
		redirect(303, '/login');
	}
};
