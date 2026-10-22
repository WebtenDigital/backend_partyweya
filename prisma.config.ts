import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// The CLI (migrate, db pull, studio) uses the direct connection.
// The app uses the pooled DATABASE_URL via the adapter in src/lib/server/prisma.ts.
// Read leniently, not with env(): `prisma generate` runs in the deploy build,
// which needs no database and may not have DIRECT_URL. Migrate still fails
// loudly without it.
export default defineConfig({
	schema: 'prisma/schema.prisma',
	migrations: {
		path: 'prisma/migrations'
	},
	datasource: {
		url: process.env.DIRECT_URL ?? ''
	}
});
