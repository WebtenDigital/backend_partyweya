// Parsing register forms: plain-language errors, and the database's guards
// translated for the person filling the form in.

import { droppedConnection } from './db.js';
import { splitPhones } from '#lib/phones.js';

export class Invalid extends Error {}

const TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

export const text = (f: FormData, k: string) => {
	const v = f.get(k);
	return typeof v === 'string' && v.trim() ? v.trim() : null;
};

export const time = (f: FormData, k: string, label: string) => {
	const v = text(f, k);
	if (v && !TIME.test(v)) throw new Invalid(`${label} must be 24-hour, like 21:00`);
	return v;
};

export const money = (f: FormData, k: string, label: string) => {
	const v = text(f, k);
	if (v == null) return null;
	const n = Number(v.replace(/[,\s]/g, ''));
	if (!Number.isInteger(n) || n < 0) throw new Invalid(`${label} must be a whole number of shillings`);
	return n;
};

export const oneOf = <T extends string>(values: Record<string, T>, v: string | null, label: string) => {
	if (v == null) return null;
	if (!Object.values(values).includes(v as T)) throw new Invalid(`Unknown ${label}: ${v}`);
	return v as T;
};

/** Readable ids, like the sheet's: "Acoustic Night" → "acoustic-night". */
export const slug = (s: string) =>
	s
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');

const CONSTRAINTS: Record<string, string> = {
	advance_cheaper_than_gate: 'The advance price has to be cheaper than the gate price.',
	vetted_means_attended: 'VETTED needs attendance; nothing else can carry it.',
	residency_vetted_means_attended: 'VETTED needs attendance; nothing else can carry it.',
	Occurrence_venueId_date_eventName_key: 'This venue already has a night with that name on that date.',
	Residency_venueId_dayOfWeek_eventName_key: 'This venue already has a standing night with that name on that day.',
	Venue_name_key: 'A venue with that name is already in the register.',
	transferred_needs_transferring_act:
		'TRANSFERRED needs someone in the lineup whose own act record says they transfer. Set that on the act first, or claim FACTUAL.',
	act_transfers_needs_note: 'Saying an act transfers needs a note on why.',
	reminder_one_subject: 'A reminder hangs off one record — a venue, an act, an organiser or a night. Pick which.',
	reminder_needs_body: 'Say what the reminder is for.',
	venue_verified_phone_listed: 'The verified number has to be one of the venue’s numbers.',
	venue_verified_phone_dated: 'A verified number needs the date it was verified, and vice versa.'
};

/** An Invalid or a known database guard → a form failure message; anything else rethrows. */
export function failureMessage(e: unknown) {
	if (e instanceof Invalid) return e.message;
	if (droppedConnection(e)) return 'Lost the connection to the database mid-save. Reload to see what was kept, then try again.';
	const msg = String((e as Error)?.message ?? e);
	const known = Object.keys(CONSTRAINTS).find((c) => msg.includes(c));
	if (known) return CONSTRAINTS[known];
	return null;
}

/** A phone number as typed, tidied: digits, spaces, an optional leading +; 9–15 digits. */
function tidyPhone(v: string) {
	const tidy = v.replace(/[-().]/g, ' ').replace(/\s+/g, ' ').trim();
	const digits = tidy.replace(/\D/g, '');
	if (!/^\+?[\d ]+$/.test(tidy) || digits.length < 9 || digits.length > 15)
		throw new Invalid(`“${v}” doesn’t look like a phone number — 9 to 15 digits, like 0772 123456 or +256 772 123456.`);
	return tidy;
}

export const phone = (f: FormData, k: string) => {
	const v = text(f, k);
	return v == null ? null : tidyPhone(v);
};

/** A venue's numbers from one field: split on "/" and ",", tidied, blanks and repeats dropped. */
export const phoneList = (f: FormData, k: string) => splitPhones(splitPhones(text(f, k)).map(tidyPhone).join('/'));
