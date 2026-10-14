import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// The CLI (migrate, db pull, studio) uses the direct connection.
// The app uses the pooled DATABASE_URL via the adapter in src/lib/server/prisma.ts.
export default defineConfig({
	schema: 'prisma/schema.prisma',
	migrations: {
		path: 'prisma/migrations'
	},
	datasource: {
		url: env('DIRECT_URL')
	}
});
