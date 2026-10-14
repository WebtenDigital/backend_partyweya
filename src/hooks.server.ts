import { redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import { hasSession } from '#lib/server/auth.js';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.authed = hasSession(event.cookies);

	if (event.route.id?.startsWith('/(app)') && !event.locals.authed) {
		redirect(303, '/login');
	}

	return resolve(event);
};
