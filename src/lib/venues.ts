// Spotting a venue that's already in the register under a slightly different
// name. Typed from Instagram bios, the likeliest damage is two rows for one
// venue, which splits its history and nothing ever reports. So this warns —
// it never blocks: some different venues really do have near names.

/** Case, punctuation, spacing and a leading "the" don't make a different venue. */
export const nameKey = (name: string) =>
	name
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^a-z0-9 ]+/g, '')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/^the /, '')
		.replace(/ /g, '');

/** At most one character added, dropped or changed. */
function withinOne(a: string, b: string) {
	if (a === b) return true;
	if (Math.abs(a.length - b.length) > 1) return false;
	let i = 0;
	while (i < a.length && i < b.length && a[i] === b[i]) i++;
	// the rest must match after skipping one character on one or both sides
	return a.slice(i + 1) === b.slice(i + 1) || a.slice(i) === b.slice(i + 1) || a.slice(i + 1) === b.slice(i);
}

export function similarVenues<V extends { name: string }>(name: string, venues: V[]): V[] {
	const k = nameKey(name);
	if (!k) return [];
	return venues.filter((v) => withinOne(k, nameKey(v.name)));
}
