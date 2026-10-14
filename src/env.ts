import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	DATABASE_URL: {
		description: 'Supabase transaction pooler (port 6543), used by the app at runtime',
		schema: (value) => {
			if (!value) throw new Error('DATABASE_URL is not set');
			return value;
		}
	}
});
