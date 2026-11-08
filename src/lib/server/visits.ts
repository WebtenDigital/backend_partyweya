// The planned visit: the week's one attendance, as an intention. It points at
// a night and a date, and is invisible to the week's expansion — planning never
// blocks the build. "Written up" is derived: an Occurrence for that night and
// date with an attendance on it. An unplanned night out creates no Visit; the
// Visit table records intention, the Occurrence records the visit.

import type { Register } from '../../generated/prisma/enums';
import { prisma } from './prisma.js';
import type { Tx } from './db.js';
import { Invalid } from './forms.js';
import { asDate, isoDate } from './register.js';
import { isoDay, mondayOf } from '../build/add.js';
import { addDays, kampalaToday } from '../build/week.js';

export interface PlannedVisit {
	id: string;
	ref: string; //        the night: a residency id, or an occurrence id
	date: string;
	register: Register | null;
	eventName: string;
	venue: { id: string; name: string };
	startTime: string | null;
	writtenUp: boolean;
	href: string; //       the write-up, pre-filled through ?date=
}

const include = {
	residency: { select: { id: true, eventName: true, startTime: true, venue: { select: { id: true, name: true } } } },
	occurrence: { select: { id: true, eventName: true, startTime: true, attendedAt: true, venue: { select: { id: true, name: true } } } }
} as const;

type Row = Awaited<ReturnType<typeof findVisits>>[number];
const findVisits = (db: Tx, where: object) => db.visit.findMany({ where: { dismissedAt: null, ...where }, include, orderBy: { date: 'asc' } });

/** Written up = an Occurrence for that night and date with an attendance on it. */
async function shaped(db: Tx, visits: Row[]): Promise<PlannedVisit[]> {
	const standing = visits.filter((v) => v.residencyId);
	const overrides = standing.length
		? await db.occurrence.findMany({
				where: { OR: standing.map((v) => ({ residencyId: v.residencyId, date: v.date })), attendedAt: { not: null } },
				select: { residencyId: true, date: true }
			})
		: [];
	const done = new Set(overrides.map((o) => `${o.residencyId}|${isoDate(o.date)}`));
	return visits.map((v) => {
		const night = (v.residency ?? v.occurrence)!;
		const date = isoDate(v.date);
		const ref = night.id;
		return {
			id: v.id,
			ref,
			date,
			register: v.register,
			eventName: night.eventName,
			venue: night.venue,
			startTime: night.startTime,
			writtenUp: v.residencyId ? done.has(`${v.residencyId}|${date}`) : !!v.occurrence?.attendedAt,
			href: `/attend/${ref}?date=${date}`
		};
	});
}

/** The visit standing for a build week — one a week; dismissed ones don't count. */
export async function weekVisit(week: string, db: Tx = prisma) {
	const [v] = await shaped(db, await findVisits(db, { date: { gte: asDate(week), lte: asDate(addDays(week, 6)) } }));
	return v ?? null;
}

/** The nudge: past, not dismissed, not written up. The nav badge counts these. */
export async function visitsDue(today: string, db: Tx = prisma) {
	return (await shaped(db, await findVisits(db, { date: { lte: asDate(today) } }))).filter((v) => !v.writtenUp);
}

/** Resolve a night and a date into a Visit's fields — the date must be one the night runs on. */
async function nightOn(db: Tx, ref: string, date: string) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Invalid('Which night?');
	const r = await db.residency.findUnique({ where: { id: ref }, select: { id: true, dayOfWeek: true, eventName: true } });
	if (r) {
		if (isoDay(date) !== r.dayOfWeek) throw new Invalid(`${r.eventName} doesn’t run that day.`);
		return { residencyId: r.id, occurrenceId: null };
	}
	const o = await db.occurrence.findUnique({ where: { id: ref }, select: { id: true, date: true } });
	if (!o) throw new Invalid('That night is no longer in the register.');
	if (isoDate(o.date) !== date) throw new Invalid('That night is on another date.');
	return { residencyId: null, occurrenceId: o.id };
}

/**
 * One visit a week, keyed off the VISIT'S OWN DATE (its ISO week) — not the
 * build window it was planned from, or two windows could put two visits in one
 * calendar week. A night already past can't be planned; earlier today still can.
 */
async function guard(db: Tx, date: string, today: string, except?: string) {
	if (date < today) throw new Invalid('That night has already passed — write it up from Visits instead, if you went.');
	const week = mondayOf(date);
	const standing = await db.visit.count({
		where: { dismissedAt: null, date: { gte: asDate(week), lte: asDate(addDays(week, 6)) }, ...(except && { id: { not: except } }) }
	});
	if (standing) throw new Invalid('A visit is already planned that week — change it or dismiss it first.');
}

/** Plan the week's visit. One a week: a second is refused while one stands. */
export async function planVisit(db: Tx, input: { ref: string; date: string; register: Register | null }, today = kampalaToday()) {
	const night = await nightOn(db, input.ref, input.date);
	await guard(db, input.date, today);
	return db.visit.create({ data: { ...night, date: asDate(input.date), register: input.register } });
}

/** Point the standing plan at a different night — the same visit, not a second one. */
export async function changeVisit(db: Tx, id: string, input: { ref: string; date: string }, today = kampalaToday()) {
	const night = await nightOn(db, input.ref, input.date);
	await guard(db, input.date, today, id);
	return db.visit.update({ where: { id }, data: { ...night, date: asDate(input.date) } });
}

/** "It never happened": one tap, no write-up, gone from the badge and the rail. */
export const dismissVisit = (db: Tx, id: string) => db.visit.update({ where: { id }, data: { dismissedAt: new Date() } });
