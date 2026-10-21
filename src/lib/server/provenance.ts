// The database half of the claim: does a lineup bill an act whose own record
// transfers? Resolved by act_for() — the same resolver the TRANSFERRED trigger
// uses — so the app can never derive a claim the database would then refuse.

import { prisma } from './prisma.js';
import type { Tx } from './db.js';

export async function lineupTransfers(lineup: string[], db: Tx = prisma): Promise<boolean> {
	if (!lineup.length) return false;
	const [row] = await db.$queryRaw<{ t: boolean }[]>`
		SELECT EXISTS (SELECT 1 FROM unnest(${lineup}::text[]) n WHERE (act_for(n))."transfers") AS t`;
	return row.t;
}
