// Resolving a billed name to an act — by name or any alias, trimmed and
// case-insensitive — and spotting near-misses before they become two acts.
// The billing sentence itself is composed in SQL (compose_billing), in one place.

export const ROLES = ['BAND', 'DJ', 'COMEDIAN', 'POET', 'ACOUSTIC_ACT', 'HOST', 'MCEE', 'ARTIST', 'OTHER'] as const;
export type ActRole = (typeof ROLES)[number];

export const ROLE_LABEL: Record<ActRole, string> = {
	BAND: 'Bands',
	DJ: 'DJs',
	COMEDIAN: 'Comedians',
	POET: 'Poets',
	ACOUSTIC_ACT: 'Acoustic acts',
	HOST: 'Hosts',
	MCEE: 'MCees',
	ARTIST: 'Artists',
	OTHER: 'Other'
};

export interface ActRef {
	id: string;
	name: string;
	aliases: string[];
	role: ActRole | null;
	transfers: boolean | null;
}

const key = (s: string) => s.trim().toLowerCase();

export function resolveAct(billed: string, acts: ActRef[]): ActRef | null {
	const k = key(billed);
	return acts.find((a) => key(a.name) === k || a.aliases.some((x) => key(x) === k)) ?? null;
}

/** "D Maestroz Band featuring Iryn Namubiru; Felicia" → names, as billed. */
export function splitLineup(text: string) {
	const seen = new Set<string>();
	return text
		.split(/\s*(?:;|,|\s+featuring\s+|\s+feat\.?\s+|\s+ft\.?\s+)\s*/i)
		.map((s) => s.trim())
		.filter((s) => s && !seen.has(key(s)) && seen.add(key(s)));
}

// "The Clan Band" ~ "clan band" ~ "Clan Bnad"; "DJ Shiru" ~ "Shiru".
const fold = (s: string) => key(s).replace(/^(the|dj|mc)\s+/, '').replace(/[^a-z0-9]/g, '');
function distance(a: string, b: string) {
	const row = Array.from({ length: b.length + 1 }, (_, i) => i);
	for (let i = 1; i <= a.length; i++) {
		let prev = row[0];
		row[0] = i;
		for (let j = 1; j <= b.length; j++) {
			const tmp = row[j];
			row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
			prev = tmp;
		}
	}
	return row[b.length];
}

/** An existing name this one is probably a misspelling of, or null if it's clearly new or already known. */
export function nearMatch(name: string, known: string[]): string | null {
	if (known.some((k) => key(k) === key(name))) return null;
	const f = fold(name);
	if (f.length < 3) return null;
	let best: { k: string; d: number } | null = null;
	for (const k of known) {
		const g = fold(k);
		if (!g) continue;
		const d = f === g ? 0 : (f.length >= 4 && g.includes(f)) || (g.length >= 4 && f.includes(g)) ? 1 : distance(f, g);
		if (d <= Math.max(1, Math.floor(Math.min(f.length, g.length) / 4)) && (!best || d < best.d)) best = { k, d };
	}
	return best?.k ?? null;
}
