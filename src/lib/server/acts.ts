// Acts and billed names, read for the lineup input, the roster and the billing.

import { prisma } from './prisma.js';
import { text } from './forms.js';
import { resolveAct, type ActRef, type ActRole } from '#lib/build/acts.js';

/** Every act on record, for resolving billed names. */
export async function loadActs(): Promise<ActRef[]> {
	const acts = await prisma.act.findMany({ select: { id: true, name: true, aliases: true, role: true, transfers: true } });
	return acts.map((a) => ({ ...a, role: a.role as ActRole | null }));
}

/** Every distinct name ever billed, on either table — classified or not. */
export async function billedNames(): Promise<string[]> {
	const rows = await prisma.$queryRaw<{ name: string }[]>`
		SELECT DISTINCT btrim(n) AS name FROM (
			SELECT unnest("lineup") AS n FROM "Residency"
			UNION ALL SELECT unnest("lineup") FROM "Occurrence"
		) x WHERE btrim(n) <> '' ORDER BY 1`;
	return rows.map((r) => r.name);
}

/** What the lineup input suggests: billed names plus act names and aliases, each with its role. */
export async function lineupSuggestions() {
	const [acts, names] = await Promise.all([loadActs(), billedNames()]);
	const seen = new Map<string, { name: string; role: ActRole | null; transfers: boolean | null }>();
	for (const n of [...acts.flatMap((a) => [a.name, ...a.aliases]), ...names]) {
		const k = n.trim().toLowerCase();
		if (seen.has(k)) continue;
		const act = resolveAct(n, acts);
		seen.set(k, { name: n.trim(), role: act?.role ?? null, transfers: act?.transfers ?? null });
	}
	return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Billing lines for many lineups in one round trip, composed by the one SQL function. */
export async function billings(lineups: string[][]): Promise<Map<string, string | null>> {
	const keys = [...new Set(lineups.filter((l) => l.length).map((l) => l.join('\u001f')))];
	const out = new Map<string, string | null>();
	if (!keys.length) return out;
	const rows = await prisma.$queryRaw<{ k: string; b: string | null }[]>`
		SELECT k, compose_billing(string_to_array(k, E'\\x1f')) AS b FROM unnest(${keys}::text[]) AS k`;
	for (const r of rows) out.set(r.k, r.b);
	return out;
}
export const billingKey = (lineup: string[]) => lineup.join('\u001f');

/** A form's lineup, if the form carried the lineup input: names in billing order, de-duplicated. */
export function lineupFrom(f: FormData, field = 'lineup'): string[] | undefined {
	if (!f.has(`${field}_sent`)) return undefined;
	const seen = new Set<string>();
	return f
		.getAll(field)
		.map((v) => (typeof v === 'string' ? v.trim() : ''))
		.filter((n) => n && !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase()));
}

/** Of these billed names, the ones no act claims — for "2 new names — classify them?". */
export async function unclassified(names: string[]) {
	if (!names.length) return [];
	const acts = await loadActs();
	return names.filter((n) => !resolveAct(n, acts));
}

/** The landing page's quiet prompt, carried in the redirect. */
export const newActsParam = (names: string[]) =>
	names.length ? `&newacts=${encodeURIComponent(names.join('|'))}` : '';
