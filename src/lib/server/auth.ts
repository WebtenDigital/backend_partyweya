import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { ADMIN_PASSWORD, SESSION_SECRET } from '$app/env/private';

// Single-user auth: one password, one signed cookie. Swap for Supabase Auth
// when a second person starts making calls.

const COOKIE = 'pw_session';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const sign = (value: string) => createHmac('sha256', SESSION_SECRET).update(value).digest('base64url');

const equal = (a: string, b: string) =>
	timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());

export const checkPassword = (attempt: string) => equal(attempt, ADMIN_PASSWORD);

export function startSession(cookies: Cookies) {
	const expires = String(Math.floor(Date.now() / 1000) + MAX_AGE);
	// SvelteKit sets `secure` by default, except over plain http on localhost.
	cookies.set(COOKIE, `${expires}.${sign(expires)}`, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: MAX_AGE
	});
}

export function endSession(cookies: Cookies) {
	cookies.delete(COOKIE, { path: '/' });
}

export function hasSession(cookies: Cookies) {
	const [expires, signature] = cookies.get(COOKIE)?.split('.') ?? [];
	if (!expires || !signature || !equal(signature, sign(expires))) return false;
	return Number(expires) > Date.now() / 1000;
}
