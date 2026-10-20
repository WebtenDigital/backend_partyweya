// Reminders: things you asked yourself to do, each hung off one record.
// The due date a reminder sorts by is its own dueOn, or else the date of the
// night it hangs off — computed here, never copied into the column, so it
// follows the night when the night moves. Nothing here touches the call
// cadence (lastContacted / nextContactDue): a reminder is not a call.

import { Prisma } from '../../generated/prisma/client';
import { prisma } from './prisma.js';
import { kampalaToday } from '#lib/build/week.js';

export type SubjectKind = 'venue' | 'act' | 'organiser' | 'residency' | 'occurrence';
export const SUBJECT_COLUMN: Record<SubjectKind, 'venueId' | 'actId' | 'organiserId' | 'residencyId' | 'occurrenceId'> = {
	venue: 'venueId',
	act: 'actId',
	organiser: 'organiserId',
	residency: 'residencyId',
	occurrence: 'occurrenceId'
};

export interface ReminderRow {
	id: string;
	body: string;
	due: string | null; //      effective: dueOn, or inherited from the night
	inherited: boolean; //      true when `due` came from the night, not the reminder
	doneAt: string | null;
	createdAt: string;
	subject: { kind: SubjectKind; id: string; label: string; href: string };
	venueId: string | null; //  the venue it's about, directly or through a night
	residencyId: string | null;
	occurrenceId: string | null;
	nightResidencyId: string | null; // an occurrence's standing night, if it overrides one
}

type Raw = {
	id: string;
	body: string;
	due: string | null;
	inherited: boolean;
	doneAt: Date | null;
	createdAt: Date;
	venueId: string | null;
	actId: string | null;
	organiserId: string | null;
	residencyId: string | null;
	occurrenceId: string | null;
	nightResidencyId: string | null;
	atVenue: string | null;
	label: string;
};

export type ReminderFilter = {
	venue?: string; //  directly on the venue, or on one of its nights
	act?: string;
	organiser?: string;
	residency?: string;
	occurrence?: string;
	ids?: { residencies: string[]; occurrences: string[] }; // the nights on a week
	done?: boolean; //  default: open only
};

export async function reminders(filter: ReminderFilter = {}, today = kampalaToday()): Promise<ReminderRow[]> {
	const where: Prisma.Sql[] = [filter.done ? Prisma.sql`r."doneAt" IS NOT NULL` : Prisma.sql`r."doneAt" IS NULL`];
	if (filter.venue) where.push(Prisma.sql`(r."venueId" = ${filter.venue} OR res."venueId" = ${filter.venue} OR o."venueId" = ${filter.venue})`);
	if (filter.act) where.push(Prisma.sql`r."actId" = ${filter.act}`);
	if (filter.organiser) where.push(Prisma.sql`r."organiserId" = ${filter.organiser}`);
	if (filter.residency) where.push(Prisma.sql`r."residencyId" = ${filter.residency}`);
	if (filter.occurrence) where.push(Prisma.sql`r."occurrenceId" = ${filter.occurrence}`);
	if (filter.ids)
		where.push(
			Prisma.sql`(r."residencyId" = ANY (${filter.ids.residencies}::text[]) OR r."occurrenceId" = ANY (${filter.ids.occurrences}::text[]))`
		);

	const rows = await prisma.$queryRaw<Raw[]>`
		WITH x AS (
			SELECT r.*,
			       COALESCE(r."venueId", res."venueId", o."venueId") AS "atVenue",
			       o."residencyId" AS "nightResidencyId",
			       -- the inherited date: the occurrence's, or the next day the standing night falls on
			       CASE WHEN r."occurrenceId" IS NOT NULL THEN o."date"
			            WHEN r."residencyId" IS NOT NULL AND res."active"
			              THEN ${today}::date + ((res."dayOfWeek" - extract(isodow FROM ${today}::date)::int + 7) % 7)
			       END AS "nightDate",
			       COALESCE(v."name", a."name", g."name",
			                res."eventName" || ' · ' || rv."name",
			                o."eventName" || ' · ' || ov."name" || ' · ' || to_char(o."date", 'FMDD Mon')) AS "label"
			FROM "Reminder" r
			LEFT JOIN "Venue" v ON v."id" = r."venueId"
			LEFT JOIN "Act" a ON a."id" = r."actId"
			LEFT JOIN "Organiser" g ON g."id" = r."organiserId"
			LEFT JOIN "Residency" res ON res."id" = r."residencyId"
			LEFT JOIN "Venue" rv ON rv."id" = res."venueId"
			LEFT JOIN "Occurrence" o ON o."id" = r."occurrenceId"
			LEFT JOIN "Venue" ov ON ov."id" = o."venueId"
			WHERE ${Prisma.join(where, ' AND ')}
		)
		SELECT "id", "body", "doneAt", "createdAt", "venueId", "actId", "organiserId", "residencyId", "occurrenceId",
		       "nightResidencyId", "atVenue", "label",
		       to_char(COALESCE("dueOn", "nightDate"), 'YYYY-MM-DD') AS "due",
		       ("dueOn" IS NULL AND "nightDate" IS NOT NULL) AS "inherited"
		FROM x
		ORDER BY COALESCE("dueOn", "nightDate") ASC NULLS LAST, "createdAt" ASC`;

	return rows.map((r) => {
		const kind: SubjectKind = r.venueId ? 'venue' : r.actId ? 'act' : r.organiserId ? 'organiser' : r.residencyId ? 'residency' : 'occurrence';
		const id = (r.venueId ?? r.actId ?? r.organiserId ?? r.residencyId ?? r.occurrenceId)!;
		const href = {
			venue: `/venues/${id}`,
			act: `/acts/${id}`,
			organiser: r.atVenue ? `/calls/${r.atVenue}` : '/calls',
			residency: `/residencies/${id}`,
			occurrence: `/occurrences/${id}`
		}[kind];
		return {
			id: r.id,
			body: r.body,
			due: r.due,
			inherited: r.inherited,
			doneAt: r.doneAt?.toISOString() ?? null,
			createdAt: r.createdAt.toISOString(),
			subject: { kind, id, label: r.label, href },
			venueId: r.atVenue,
			residencyId: r.residencyId,
			occurrenceId: r.occurrenceId,
			nightResidencyId: r.nightResidencyId
		};
	});
}

/** The honesty readout: written / cleared / overdue / oldest still open. */
export async function reminderHealth(open: ReminderRow[], today = kampalaToday()) {
	const [written, cleared] = await Promise.all([
		prisma.reminder.count(),
		prisma.reminder.count({ where: { doneAt: { not: null } } })
	]);
	const oldest = open.reduce<string | null>((min, r) => (!min || r.createdAt < min ? r.createdAt : min), null);
	return {
		written,
		cleared,
		open: open.length,
		overdue: open.filter((r) => r.due && r.due < today).length,
		oldest: oldest ? kampalaToday(new Date(oldest)) : null
	};
}

/** Everything a reminder can be written about from the queue: one box, three kinds. */
export async function subjects() {
	const [venues, acts, organisers] = await Promise.all([
		prisma.venue.findMany({ select: { id: true, name: true, zoneName: true }, orderBy: { name: 'asc' } }),
		prisma.act.findMany({ select: { id: true, name: true, aliases: true }, orderBy: { name: 'asc' } }),
		prisma.organiser.findMany({ select: { id: true, name: true, contactName: true }, orderBy: { name: 'asc' } })
	]);
	return [
		...venues.map((v) => ({ kind: 'venue' as const, id: v.id, label: v.name, hint: v.zoneName ?? 'venue', also: [] as string[] })),
		...acts.map((a) => ({ kind: 'act' as const, id: a.id, label: a.name, hint: 'act', also: a.aliases })),
		...organisers.map((o) => ({ kind: 'organiser' as const, id: o.id, label: o.name, hint: 'organiser', also: o.contactName ? [o.contactName] : [] }))
	];
}
export type Subject = Awaited<ReturnType<typeof subjects>>[number];
