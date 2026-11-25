// The database half of the claim: does a lineup bill an act whose own record
// transfers? Resolved by act_for() — the same resolver the TRANSFERRED trigger
// uses — so the app can never derive a claim the database would then refuse.

import { prisma } from './prisma.js';
import type { Tx } from './db.js';

/**
 * The lineup a claim is judged on — the same rule as the TRANSFERRED trigger.
 * A dated row bills its own lineup; with none, its standing night's — unless
 * that night rotates, when an empty date bills nobody: "a new celebrity every
 * week" is a promise about an unnamed person, and transfers nothing.
 */
export const billedLineup = (own: string[], rule: { lineup: string[]; rotatingAct: boolean } | null | undefined) =>
	own.length ? own : rule && !rule.rotatingAct ? rule.lineup : [];

/** A standing night's own claim: a rotating one is never judged on a name. */
export const ruleBills = (rule: { lineup: string[]; rotatingAct: boolean }) => (rule.rotatingAct ? [] : rule.lineup);

export async function lineupTransfers(lineup: string[], db: Tx = prisma): Promise<boolean> {
	if (!lineup.length) return false;
	const [row] = await db.$queryRaw<{ t: boolean }[]>`
		SELECT EXISTS (SELECT 1 FROM unnest(${lineup}::text[]) n WHERE (act_for(n))."transfers") AS t`;
	return row.t;
}
