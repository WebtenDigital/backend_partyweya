import { defineEnvVars } from '@sveltejs/kit/env';

const required = (name: string, minLength = 1) => (value: string | undefined) => {
	if (!value || value.length < minLength)
		throw new Error(`${name} must be set (at least ${minLength} characters)`);
	return value;
};

export const variables = defineEnvVars({
	DATABASE_URL: {
		description: 'Supabase transaction pooler (port 6543), used by the app at runtime',
		schema: required('DATABASE_URL')
	},
	ADMIN_PASSWORD: {
		description: 'The single login password for the internal tool',
		schema: required('ADMIN_PASSWORD', 16)
	},
	SESSION_SECRET: {
		description: 'HMAC key for the session cookie; rotate it to log everyone out',
		schema: required('SESSION_SECRET', 32)
	}
});
