// The Prisma client, over pg through Supabase's transaction pooler.
//
// The pooler occasionally closes a connection under us (P1017, "Server has
// closed the connection") — seen on the first query after a quiet spell.
// A read that hits one is retried once on a fresh connection: re-running a
// read is always safe. A write is never retried, because a connection that
// drops mid-write may or may not have committed; it fails with a message
// that says so (see failureMessage).

import { PrismaPg } from '@prisma/adapter-pg';
import type { PoolConfig } from 'pg';
import { PrismaClient } from '../../generated/prisma/client';

const READS = new Set([
	'findUnique',
	'findUniqueOrThrow',
	'findFirst',
	'findFirstOrThrow',
	'findMany',
	'count',
	'aggregate',
	'groupBy',
	'$queryRaw' // every $queryRaw in the register is a SELECT; writes use the model API or $executeRaw
]);

export const droppedConnection = (e: unknown) => {
	const err = e as { code?: string; message?: string } | null;
	return err?.code === 'P1017' || /closed the connection|ConnectionClosed|Connection terminated/i.test(err?.message ?? '');
};

export function createPrisma(connectionString: string, pool: Partial<PoolConfig> = {}) {
	const adapter = new PrismaPg({ connectionString, keepAlive: true, ...pool });
	return new PrismaClient({ adapter }).$extends({
		name: 'retry-dropped-reads',
		query: {
			async $allOperations({ operation, args, query }) {
				try {
					return await query(args);
				} catch (e) {
					if (!READS.has(operation) || !droppedConnection(e)) throw e;
					console.warn(`[db] connection dropped during ${operation}; retrying once`);
					return query(args);
				}
			}
		}
	});
}

export type Db = ReturnType<typeof createPrisma>;
/** The client inside $transaction — what functions that take a `tx` should accept. */
export type Tx = Omit<Db, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>;
