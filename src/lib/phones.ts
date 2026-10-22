// A venue's numbers: every one found, in the order to try them, and which one a
// call actually answered. No labels — a bio's "0773814441 / 0703944142" says
// nothing about which is the manager's, and that is learned on a call.

export interface Numbers {
	phones: string[];
	verifiedPhone: string | null;
}

const digits = (n: string) => n.replace(/\D/g, '');
export const samePhone = (a: string, b: string) => digits(a) === digits(b);

/** "0773814441 / 0703944142" or "0773814441, 0703944142", straight out of a bio. */
export function splitPhones(input: string | null | undefined): string[] {
	const out: string[] = [];
	for (const part of (input ?? '').split(/[/,]/)) {
		const n = part.trim();
		if (n && !out.some((o) => samePhone(o, n))) out.push(n);
	}
	return out;
}

/** How a list is shown and typed: joined with " / ". */
export const showPhones = (phones: string[]) => phones.join(' / ');

/** The number to dial: the one that was answered, else the first. */
export const dialNumber = (v: Numbers) => v.verifiedPhone ?? v.phones[0] ?? null;

/**
 * A new list, typed or pasted. Verification survives only while the verified
 * number is still on it — changing or removing it means nobody has answered
 * what's there now.
 */
export function withPhones(current: Numbers, phones: string[]) {
	const kept = current.verifiedPhone ? phones.find((p) => samePhone(p, current.verifiedPhone!)) : undefined;
	return kept ? { phones, verifiedPhone: kept } : { phones, verifiedPhone: null, phoneVerifiedAt: null };
}

/** A call reached someone on `answered`: it's the verified number, and goes first. */
export function answeredOn(phones: string[], answered: string) {
	const n = phones.find((p) => samePhone(p, answered)) ?? answered;
	return { phones: [n, ...phones.filter((p) => !samePhone(p, n))], verifiedPhone: n };
}
