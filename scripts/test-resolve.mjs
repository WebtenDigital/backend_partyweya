// For `npm test`: the app imports './week.js' meaning week.ts (Vite resolves it).
// Node runs .ts directly but doesn't make that swap, so this hook does.
import { registerHooks } from 'node:module';

registerHooks({
	resolve(specifier, context, next) {
		try {
			return next(specifier, context);
		} catch (e) {
			if (e?.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.') && specifier.endsWith('.js'))
				return next(specifier.slice(0, -3) + '.ts', context);
			throw e;
		}
	}
});
