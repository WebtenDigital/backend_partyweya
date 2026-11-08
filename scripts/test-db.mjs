// For `npm run test:db`: query tests against the real database, each inside a
// transaction that is rolled back. Reads .env (DIRECT_URL), stands in for
// SvelteKit's $app/env/private, and resolves the app's './x.js' and '#lib/x.js'
// imports to their .ts files the way Vite does.
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';

if (existsSync('.env')) process.loadEnvFile('.env');

registerHooks({
	resolve(specifier, context, next) {
		if (specifier === '$app/env/private') {
			const env = { DATABASE_URL: process.env.DIRECT_URL ?? process.env.DATABASE_URL, CALLER_NAME: 'TEST' };
			const src = Object.entries(env).map(([k, v]) => `export const ${k} = ${JSON.stringify(v)};`).join('');
			return { url: `data:text/javascript,${encodeURIComponent(src)}`, shortCircuit: true };
		}
		// The app's prisma client, swappable for a test's transaction (tests/support/prisma.ts).
		if (specifier === '#lib/server/prisma.js' || (specifier === './prisma.js' && context.parentURL?.includes('/src/lib/server/')))
			return next(new URL('../tests/support/prisma.ts', import.meta.url).href, context);
		try {
			return next(specifier, context);
		} catch (e) {
			if (e?.code !== 'ERR_MODULE_NOT_FOUND' || !(specifier.startsWith('.') || specifier.startsWith('#'))) throw e;
			return next(specifier.endsWith('.js') ? specifier.slice(0, -3) + '.ts' : `${specifier}.ts`, context);
		}
	}
});
