// What's owed in a build week: the call round and open reminders — loaded once
// here for the queue screen (/calls) and for the badge on every page, so the
// two can never disagree about what's on it. Vouches running out are not here:
// they need a visit, not a call, and live on the Sunday Build.
//
// The call round reads three sources, never merged into one list:
//   BEFORE PUBLISHING  a night in the window isn't confirmed (the build's own expansion)
//   CADENCE            the venue's tier, derived from its nights (tier.ts), has come due
//   DISCOVERY          no night on file at all, and a number to ask on
// A date-driven query can only see a venue with something pending; a venue
// never called has nothing pending, so discovery is its own list.

import { prisma } from './prisma.js';
import type { Tx } from './db.js';
import { asDate, isoDate, kampalaDate, loadWeek } from './register.js';
import { reminders } from './reminders.js';
import { DISCOVERY_CAP, UNREACHABLE_AFTER, nextWorkingDay, rankDiscovery } from './discovery.js';
import { addDays, nextMonday } from '#lib/build/week.js';
import { callQueue, owedNow, type QueueDue } from '#lib/build/calls.js';
import { dueDateForNight, dueDateForVenue, tierForNight, tierForVenue, type Night } from './tier.js';
import { dialNumber } from '#lib/phones.js';

/** A venue with a night on file: any standing night or dated row, ever. */
const hasNight = { OR: [{ residencies: { some: {} } }, { occurrences: { some: {} } }] };
const endOf = (day: string) => new Date(`${day}T23:59:59+03:00`);

/**
 * Discovery: no night recorded (so no tier), a number to ask on, not "runs
 * nothing". Ranked and capped — an uncapped list is not a work list. A
 * no-answer rolls the venue to the next working day. After UNREACHABLE_AFTER
 * no-answers in a row — or with no number at all — it's on the UNREACHABLE
 * list instead, which measures the numbers rather than the venues.
 */
export async function loadDiscovery(today: string, db: Tx = prisma) {
	const [candidates, withNights] = await Promise.all([
		db.venue.findMany({
			where: { residencies: { none: {} }, occurrences: { none: {} }, noProgramme: false },
			select: { id: true, name: true, zoneName: true, phones: true, verifiedPhone: true, lastContacted: true, contactAttempts: true, lastAttemptAt: true }
		}),
		db.venue.groupBy({ by: ['zoneName'], where: hasNight, _count: true })
	]);
	const shaped = candidates.map((v) => ({
		id: v.id,
		name: v.name,
		zone: v.zoneName,
		phones: v.phones,
		dial: dialNumber(v),
		lastContacted: kampalaDate(v.lastContacted),
		contactAttempts: v.contactAttempts,
		lastAttempt: kampalaDate(v.lastAttemptAt)
	}));
	const unreachable = shaped.filter((v) => !v.phones.length || v.contactAttempts >= UNREACHABLE_AFTER);
	const open = shaped.filter((v) => v.phones.length && v.contactAttempts < UNREACHABLE_AFTER);
	// Tried and not answered: back on the next working day, not today.
	const ready = open.filter((v) => !v.lastAttempt || nextWorkingDay(v.lastAttempt) <= today);
	const ranked = rankDiscovery(ready, new Map(withNights.map((z) => [z.zoneName, z._count])));
	return {
		total: ready.length,
		rows: ranked.slice(0, DISCOVERY_CAP),
		waiting: open.length - ready.length,
		// Four no-answers: the number is the problem. Listed.
		unreachable: unreachable
			.filter((v) => v.phones.length)
			.map((v) => ({ id: v.id, name: v.name, phones: v.phones, contactAttempts: v.contactAttempts }))
			.sort((a, b) => a.name.localeCompare(b.name)),
		// No night and no number: desk research, not a call — counted, and linked to /venues.
		needNumber: unreachable.filter((v) => !v.phones.length).length,
		ready: new Set(ready.map((v) => v.id)) // on the list today, past the cap too
	};
}

/**
 * Every venue whose derived tier has come due by `until` — read from its nights
 * (active standing nights, and one-offs still ahead), never from Venue.tier or
 * Venue.nextContactDue. Fine to compute per request at this size.
 */
export async function derivedCadence(today: string, until: string, db: Tx = prisma): Promise<QueueDue[]> {
	const [standing, oneOffs] = await Promise.all([
		db.residency.findMany({ where: { active: true }, select: { venueId: true, lastConfirmed: true, runningSince: true, firstConfirmedAt: true } }),
		// A dated row that overrides a standing night confirms that date, not the rule.
		db.occurrence.findMany({
			where: { residencyId: null, status: { not: 'CANCELLED' }, date: { gte: asDate(today) } },
			select: { venueId: true, date: true, status: true }
		})
	]);
	const nights = new Map<string, Night[]>();
	const push = (venueId: string, n: Night) => nights.set(venueId, [...(nights.get(venueId) ?? []), n]);
	for (const r of standing)
		push(r.venueId, { kind: 'standing', lastConfirmed: kampalaDate(r.lastConfirmed), runningSince: kampalaDate(r.runningSince), firstConfirmedAt: kampalaDate(r.firstConfirmedAt) });
	for (const o of oneOffs) push(o.venueId, { kind: 'one-off', date: isoDate(o.date), confirmed: o.status === 'CONFIRMED' });

	const due: QueueDue[] = [];
	for (const [venueId, ns] of nights) {
		const tier = tierForVenue(ns, today);
		const when = dueDateForVenue(ns, today);
		if (!tier || !when || when > until) continue;
		const driving = ns.filter((n) => tierForNight(n, today) === tier && dueDateForNight(n, today) === when)[0];
		due.push({
			venueId,
			tier,
			due: when,
			lastConfirmed: driving.kind === 'standing' ? driving.lastConfirmed : null,
			standingC: ns.some((n) => n.kind === 'standing' && tierForNight(n, today) === 'C')
		});
	}
	return due;
}

export async function loadOwed(week: string, today: string, db: Tx = prisma) {
	const weekEnd = addDays(week, 6);

	// Dated rows count from today, so this weekend's gaps are on Thursday's list too.
	const [{ residencies, rows, gate }, occurrences, dueVenues, open, discovery] = await Promise.all([
		loadWeek(week, db),
		db.occurrence.findMany({
			where: {
				date: { gte: asDate(today < week ? today : week), lte: asDate(weekEnd) },
				status: { not: 'CANCELLED' }
			}
		}),
		// The cadence: derived from the nights, due today or earlier.
		derivedCadence(today, today, db),
		// Open only, by effective due date. Written by hand, not derived.
		reminders({}, today, db),
		loadDiscovery(today, db)
	]);
	// A venue with no night has no tier — discovery calls it — so the two never overlap.
	const cadence = dueVenues;
	// Standing nights the Sunday Build itself reads as unconfirmed, still ahead in the window.
	const unconfirmed = rows
		.filter((r) => r.kind === 'STANDING' && r.state === 'lead' && r.date >= today)
		.map((r) => ({ residencyId: r.residencyId!, date: r.date }));

	const venueIds = new Set([...residencies.map((r) => r.venueId), ...occurrences.map((o) => o.venueId), ...cadence.map((v) => v.venueId)]);
	const venues = await db.venue.findMany({
		where: { id: { in: [...venueIds] } },
		select: { id: true, name: true, phones: true, verifiedPhone: true, conversationTest: true, zoneName: true, updatedAt: true }
	});

	const organiserIds = [...new Set([...residencies, ...occurrences].map((x) => x.organiserId).filter((x): x is string => !!x))];
	const organisers = await db.organiser.findMany({
		where: { id: { in: organiserIds } },
		select: { id: true, name: true, contactName: true, phone: true, whatsapp: true }
	});

	const queue = callQueue(
		week,
		venues.map(({ phones, verifiedPhone, ...v }) => ({ ...v, phone: dialNumber({ phones, verifiedPhone }), zone: v.zoneName, updatedAt: v.updatedAt.toISOString() })),
		residencies.map((r) => ({
			id: r.id,
			venueId: r.venueId,
			organiserId: r.organiserId,
			bookingPhone: r.bookingPhone,
			bookingPhoneNote: r.bookingPhoneNote,
			eventName: r.eventName,
			category: r.category,
			dayOfWeek: r.dayOfWeek,
			startTime: r.startTime,
			lastConfirmed: kampalaDate(r.lastConfirmed),
			attendedAt: r.attendedAt ? isoDate(r.attendedAt) : null
		})),
		occurrences.map((o) => ({
			id: o.id,
			venueId: o.venueId,
			organiserId: o.organiserId,
			residencyId: o.residencyId,
			bookingPhone: o.bookingPhone,
			bookingPhoneNote: o.bookingPhoneNote,
			date: isoDate(o.date),
			eventName: o.eventName,
			startTime: o.startTime,
			priceGate: o.priceGate,
			register: o.register,
			status: o.status
		})),
		organisers,
		cadence,
		unconfirmed
	);

	const { total, rows: listed, waiting, unreachable, needNumber } = discovery;
	return { queue, gate, reminders: open, discovery: { total, rows: listed, waiting, unreachable, needNumber } };
}

/** The badge on "This week": the default build week's owed-now count. Discovery has no date, so it never counts. */
export async function owedCount(today: string) {
	const { queue, reminders } = await loadOwed(nextMonday(today), today);
	return owedNow(queue, reminders, today);
}

/** For the Sunday Build's rail: what we can actually publish from, against what's on file. */
export async function nightCoverage(db: Tx = prisma) {
	const [venues, withNight] = await Promise.all([db.venue.count(), db.venue.count({ where: hasNight })]);
	return { venues, withNight };
}
