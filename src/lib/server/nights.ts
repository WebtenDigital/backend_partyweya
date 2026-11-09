// Recording the nights a venue runs, from the NightBlock form (n_* fields).
// Shared by the discovery call and by "write up a night out" for a venue with
// nothing on file, so the two can never disagree about what a night is.
//
// Weekly, monthly and seasonal nights become Residencies; a one-off becomes an
// Occurrence. A weekly night written as a dated row would have to be retyped
// every week. Start time is required on both: a row without one is not a row.

import type { Category as CategoryT, Register as RegisterT, Source } from '../../generated/prisma/enums';
import { Category, Register } from '../../generated/prisma/enums';
import type { Tx } from './db.js';
import { Invalid, money, oneOf, slug, text, time } from './forms.js';
import { asDate } from './register.js';
import { addDays } from '../build/week.js';
import { isoDay } from '../build/add.js';

export const RECURRENCES = [
	{ key: 'WEEKLY', label: 'Weekly' },
	{ key: 'MONTHLY', label: 'Monthly' },
	{ key: 'SEASONAL', label: 'Seasonal' },
	{ key: 'ONE_OFF', label: 'One-off' }
] as const;

export type Night = {
	eventName: string;
	category: CategoryT;
	recurrence: (typeof RECURRENCES)[number]['key'];
	dayOfWeek: number | null;
	date: string | null;
	startTime: string;
	endTime: string | null;
	priceGate: number | null;
	priceAdvance: number | null;
	runningSince: string | null;
	lineup: string[];
	register: RegisterT;
};

const FIELDS = ['name', 'category', 'recurrence', 'day', 'date', 'start', 'end', 'gate', 'advance', 'since', 'lineup', 'register'];

/**
 * The night blocks on a form, in order. `dates` says which one-off dates make
 * sense: 'ahead' for a call (what they will run), 'fortnight' for a night out
 * being written up (it already happened, in the window the write-up allows).
 * `register` is the fallback when a block doesn't set one — question 6's, on a
 * call; on a night out there is none, so each block must say.
 */
export function nightsFrom(f: FormData, today: string, opts: { register: RegisterT | null; dates: 'ahead' | 'fortnight' }): Night[] {
	const blocks = f.getAll('n_name').map((_, i) => {
		const night = new FormData();
		for (const k of FIELDS) night.set(k, String(f.getAll(`n_${k}`)[i] ?? ''));
		return night;
	});
	// A block left completely empty is just an unused "add another night".
	const filled = blocks.filter((b) => FIELDS.some((k) => k !== 'recurrence' && k !== 'category' && k !== 'register' && text(b, k)));
	return filled.map((b, n) => {
		const at = filled.length > 1 ? ` (night ${n + 1})` : '';
		const eventName = text(b, 'name');
		if (!eventName) throw new Invalid(`What’s the night called${at}?`);
		const category = oneOf(Category, text(b, 'category'), 'category');
		if (!category) throw new Invalid(`What kind of night is it${at}?`);
		const recurrence = RECURRENCES.find((r) => r.key === text(b, 'recurrence'))?.key;
		if (!recurrence) throw new Invalid(`How often does it run${at}?`);
		const startTime = time(b, 'start', `Start${at}`);
		if (!startTime) throw new Invalid(`What time does it start${at}? A night without a start time can’t be recorded.`);
		const standing = recurrence !== 'ONE_OFF';
		const day = Number(text(b, 'day'));
		if (standing && !(day >= 1 && day <= 7)) throw new Invalid(`Which day of the week${at}?`);
		const date = text(b, 'date');
		if (!standing && !(date && /^\d{4}-\d{2}-\d{2}$/.test(date))) throw new Invalid(`Which date${at}?`);
		if (!standing && opts.dates === 'ahead' && date! < today) throw new Invalid(`That date has passed${at}.`);
		if (!standing && opts.dates === 'fortnight' && (date! > today || date! < addDays(today, -13)))
			throw new Invalid(`A night out in the last fortnight${at} — between ${addDays(today, -13)} and today.`);
		const register = oneOf(Register, text(b, 'register'), 'register') ?? opts.register;
		if (!register) throw new Invalid(`Which register was it${at}?`);
		const since = text(b, 'since') ?? '';
		return {
			eventName,
			category,
			recurrence,
			dayOfWeek: standing ? day : null,
			date: standing ? null : date,
			startTime,
			endTime: time(b, 'end', `Wrap${at}`),
			priceGate: money(b, 'gate', `Gate price${at}`),
			// A standing night's fee is set once; only a dated row carries an advance price.
			priceAdvance: standing ? null : money(b, 'advance', `Advance price${at}`),
			runningSince: standing && /^\d{4}-\d{2}$/.test(since) ? `${since}-01` : null,
			lineup: (text(b, 'lineup') ?? '')
				.split(/[,;]/)
				.map((s) => s.trim())
				.filter(Boolean),
			register
		};
	});
}

/**
 * Write the nights. `confirmed` is who confirmed them and when — a call that
 * reached the venue. Without it they go in unconfirmed (an Occurrence as a
 * LEAD, a Residency never confirmed), the state a flyer would produce, until
 * something confirms them. With a source the claim is FACTUAL; with none (a
 * night added from a visit, before its write-up) there is no claim at all —
 * never ATTENDED, or an abandoned write-up would leave a vouch with no visit
 * behind it. VETTED only ever comes from the write-up. Returns where each
 * landed, for the caller to link on.
 */
export async function createNights(
	db: Tx,
	venueId: string,
	nights: Night[],
	how: { source: Source | null; confirmed: { at: Date; by: string | null } | null }
) {
	const made: { kind: 'residency' | 'occurrence'; ref: string; night: Night }[] = [];
	for (const n of nights) {
		const common = {
			venueId,
			eventName: n.eventName,
			category: n.category,
			startTime: n.startTime,
			endTime: n.endTime,
			priceGate: n.priceGate,
			register: n.register,
			lineup: n.lineup,
			source: how.source,
			claimType: how.source ? ('FACTUAL' as const) : null
		};
		if (n.recurrence === 'ONE_OFF') {
			let id = `${slug(n.eventName)}-${n.date}`;
			if (await db.occurrence.findUnique({ where: { id } })) id = `${venueId}-${id}`;
			await db.occurrence.create({
				data: {
					...common,
					id,
					date: asDate(n.date!),
					priceAdvance: n.priceAdvance,
					...(how.confirmed ? { status: 'CONFIRMED', confirmedOn: how.confirmed.at, confirmedBy: how.confirmed.by } : { status: 'LEAD' })
				}
			});
			made.push({ kind: 'occurrence', ref: id, night: n });
		} else {
			let id = `${venueId}-${slug(n.eventName)}`;
			if (await db.residency.findUnique({ where: { id } })) id = `${id}-${n.dayOfWeek}`;
			await db.residency.create({
				data: {
					...common,
					id,
					dayOfWeek: n.dayOfWeek!,
					recurrence: n.recurrence,
					runningSince: n.runningSince ? new Date(`${n.runningSince}T00:00:00+03:00`) : null,
					lastConfirmed: how.confirmed?.at ?? null
				}
			});
			made.push({ kind: 'residency', ref: id, night: n });
		}
	}
	return made;
}

/** The last date on or before `today` falling on ISO weekday `dow` — the night just been to. */
const lastOn = (today: string, dow: number) => addDays(today, -((isoDay(today) - dow + 7) % 7));

/**
 * A night out at a venue with nothing on file: add the one night (unconfirmed,
 * no claim — the write-up is what makes it attended), take "runs nothing" off
 * the venue since being there contradicts it, and return the write-up's link.
 * Creates no Visit: this records a visit, not a plan.
 */
export async function addNightOut(db: Tx, venueId: string, f: FormData, today: string) {
	const nights = nightsFrom(f, today, { register: null, dates: 'fortnight' });
	if (nights.length !== 1) throw new Invalid('Describe the night you were at.');
	const [made] = await createNights(db, venueId, nights, { source: null, confirmed: null });
	await db.venue.update({ where: { id: venueId }, data: { noProgramme: false, noProgrammeAt: null } });
	const date = made.kind === 'occurrence' ? made.night.date! : lastOn(today, made.night.dayOfWeek!);
	return `/attend/${made.ref}?date=${date}`;
}
