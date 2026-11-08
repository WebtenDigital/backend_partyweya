// The visit write-up: what comes back from the weekly attendance. The only
// path in the register to a VETTED claim — the database refuses VETTED from
// any source but ATTENDED.
//
// You attend a NIGHT, not a venue, so everything judged lands at the night's
// grain: the verdict (Rule F2), the register, the sentence. For a standing
// night the night attended is an expanded instance, so it's materialised as
// the override Occurrence for that date (the same shape buildWeek already
// reads as an override) — and the Residency keeps the vouch too, because the
// gate's live-vetted check and Rule F5's clock read it there for the weeks
// that follow.
//
// It writes no Publication row: deciding what goes in the carousel is the
// Sunday Build's job.

import type { ConversationTest, Register } from '../../generated/prisma/enums';
import type { Tx } from './db.js';
import { Invalid, slug } from './forms.js';
import { asDate, isoDate, kampalaDate } from './register.js';
import { claimFor } from '../provenance.js';
import { lineupTransfers } from './provenance.js';
import { isoDay } from '../build/add.js';

export interface VisitInput {
	ref: string; //                 a residency id or an occurrence id
	date: string; //                the night attended, YYYY-MM-DD
	arrivedAt: string | null; //    "HH:MM"
	leftAt: string | null;
	clears: boolean; //             Rule F2: required, no default
	register: Register; //          judged from the room
	// The conversation test as OBSERVED in the room — optional, never blocks a save,
	// never written to Venue. It tells a mapping miss from a venue that misdescribed itself.
	observedConversation?: ConversationTest | null;
	nothingDiffered: boolean; //    the one-tap: the section catches exceptions
	actualStartTime: string | null;
	actualPrice: number | null;
	actualLineup: string[];
	correct: { start: boolean; price: boolean; lineup: boolean }; // "correct the register too"
	vettedNote: string | null;
	leads: string[]; //             free text, one per line → reminders on the venue
	costEntry: number | null;
	costTransport: number | null;
	costSpend: number | null;
	initials: string;
	today: string;
	now?: Date;
}

const DAYS = ['', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'];
const money = (n: number | null) => (n == null ? 'nothing' : n.toLocaleString('en'));
const sameLineup = (a: string[], b: string[]) => a.map((s) => s.trim().toLowerCase()).join('|') === b.map((s) => s.trim().toLowerCase()).join('|');

/** The night a write-up is about, and what the register says about it. */
export async function visitNight(db: Tx, ref: string) {
	const venue = { select: { id: true, name: true, zoneName: true, provisionalRegister: true, conversationTest: true, conversationTestAt: true, lastAttended: true } };
	const r = await db.residency.findUnique({ where: { id: ref }, include: { venue } });
	if (r)
		return {
			kind: 'residency' as const,
			id: r.id,
			residency: r,
			venue: r.venue,
			eventName: r.eventName,
			category: r.category,
			said: { start: r.startTime, end: r.endTime, price: r.priceGate, lineup: r.lineup }
		};
	const o = await db.occurrence.findUnique({
		where: { id: ref },
		include: { venue, residency: { select: { startTime: true, endTime: true, priceGate: true, lineup: true } } }
	});
	if (o)
		return {
			kind: 'occurrence' as const,
			id: o.id,
			occurrence: o,
			venue: o.venue,
			eventName: o.eventName,
			category: o.category,
			said: {
				start: o.startTime ?? o.residency?.startTime ?? null,
				end: o.endTime ?? o.residency?.endTime ?? null,
				price: o.priceGate ?? o.residency?.priceGate ?? null,
				lineup: o.lineup.length ? o.lineup : (o.residency?.lineup ?? [])
			}
		};
	return null;
}

export async function recordVisit(db: Tx, v: VisitInput) {
	const now = v.now ?? new Date();
	const n = await visitNight(db, v.ref);
	if (!n) throw new Invalid('That night is no longer in the register.');

	// Both old checks stand: a real date on the night's own weekday, and who was there.
	const date = n.kind === 'occurrence' ? isoDate(n.occurrence.date) : v.date;
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Invalid('Which night were you there?');
	if (date > v.today) throw new Invalid(n.kind === 'occurrence' ? 'This night hasn’t happened yet.' : 'That date hasn’t happened yet.');
	if (n.kind === 'residency' && isoDay(date) !== n.residency.dayOfWeek)
		throw new Invalid(`${n.eventName} runs on ${DAYS[n.residency.dayOfWeek]} — pick the night you were there.`);
	if (!/^[A-Z][A-Z .'-]{1,23}$/.test(v.initials)) throw new Invalid('Your initials — who stood in the room. Letters, like RM.');

	// What the register said against what was true — kept as plain lines, never scored.
	const actualLineup = v.nothingDiffered ? [] : v.actualLineup;
	const actualStart = v.nothingDiffered ? null : v.actualStartTime;
	const actualPrice = v.nothingDiffered ? null : v.actualPrice;
	const mismatches = [
		actualStart && actualStart !== n.said.start && `start: said ${n.said.start ?? 'nothing'}, opened ${actualStart}`,
		actualPrice != null && actualPrice !== n.said.price && `gate: said ${money(n.said.price)}, was ${money(actualPrice)}`,
		actualLineup.length && !sameLineup(actualLineup, n.said.lineup) && `lineup: said ${n.said.lineup.join(', ') || 'nothing'}, was ${actualLineup.join(', ')}`
	].filter((m): m is string => !!m);

	const at = asDate(date);
	const later = (current: Date | null) => !current || kampalaDate(current)! < date; // never move a date backwards
	const billed = actualLineup.length ? actualLineup : n.said.lineup;
	const claimType = claimFor('ATTENDED', await lineupTransfers(billed, db));

	const writeUp = {
		source: 'ATTENDED' as const,
		claimType,
		status: 'CONFIRMED' as const,
		attendedAt: at,
		attendedBy: v.initials,
		register: v.register,
		clearsF2: v.clears,
		// The experiment: the guess and the raw answer behind it, as they stood.
		predictedRegister: n.venue.provisionalRegister,
		predictedFrom: n.venue.conversationTest as ConversationTest | null,
		observedConversation: v.observedConversation ?? null,
		arrivedAt: v.arrivedAt,
		leftAt: v.leftAt,
		actualStartTime: actualStart,
		actualPrice,
		actualLineup,
		mismatches,
		vettedNote: v.vettedNote,
		costEntry: v.costEntry,
		costTransport: v.costTransport,
		costSpend: v.costSpend
	};

	let occurrenceId: string;
	if (n.kind === 'occurrence') {
		// A one-off (or an existing override): the write-up goes on its own row. Never a second.
		occurrenceId = n.id;
		await db.occurrence.update({
			where: { id: n.id },
			data: {
				...writeUp,
				...(later(n.occurrence.confirmedOn) && { confirmedOn: at, confirmedBy: v.initials }),
				// "Correct the register too" — deliberate, per field, never a side effect.
				...(v.correct.start && actualStart && { startTime: actualStart }),
				...(v.correct.price && actualPrice != null && { priceGate: actualPrice }),
				...(v.correct.lineup && actualLineup.length && { lineup: actualLineup })
			}
		});
	} else {
		// A standing night: find or create the override Occurrence for that date —
		// what buildWeek already reads as one. Its own fields stay empty so the night
		// still reads as the residency; the write-up fields carry the visit.
		const r = n.residency;
		const existing = await db.occurrence.findFirst({ where: { residencyId: r.id, date: at }, select: { id: true, confirmedOn: true } });
		if (existing) {
			occurrenceId = existing.id;
			await db.occurrence.update({
				where: { id: existing.id },
				data: { ...writeUp, ...(later(existing.confirmedOn) && { confirmedOn: at, confirmedBy: v.initials }) }
			});
		} else {
			occurrenceId = `${slug(r.eventName)}-${date}`;
			if (await db.occurrence.findUnique({ where: { id: occurrenceId } })) occurrenceId = `${r.venueId}-${occurrenceId}`;
			await db.occurrence.create({
				data: {
					...writeUp,
					id: occurrenceId,
					date: at,
					venueId: r.venueId,
					residencyId: r.id,
					eventName: r.eventName,
					category: r.category,
					confirmedOn: at,
					confirmedBy: v.initials
				}
			});
		}
		// The vouch stays on the rule too: the following weeks' rows read it there.
		// An older visit written up late never replaces a newer one.
		await db.residency.update({
			where: { id: r.id },
			data: {
				...(later(r.attendedAt) && { source: 'ATTENDED', claimType, attendedAt: at, attendedBy: v.initials, register: v.register, clearsF2: v.clears }),
				...(later(r.lastConfirmed) && { lastConfirmed: at }),
				...(v.correct.start && actualStart && { startTime: actualStart }),
				...(v.correct.price && actualPrice != null && { priceGate: actualPrice }),
				...(v.correct.lineup && actualLineup.length && { lineup: actualLineup })
			}
		});
	}

	// The venue: judged register beside the guess, never over it. A phone answer to
	// question 6 later moves provisionalRegister and leaves these alone.
	await db.venue.update({
		where: { id: n.venue.id },
		data: {
			register: v.register,
			registerJudgedAt: now,
			...(later(n.venue.lastAttended) && { lastAttended: at })
		}
	});

	// Posters, a board by the door: flyer-grade claims. They reach the caller as
	// reminders on the venue, and the call turns them into rows.
	for (const lead of v.leads.map((l) => l.trim()).filter(Boolean)) {
		await db.reminder.create({ data: { venueId: n.venue.id, body: `Seen at the visit on ${date}: ${lead}` } });
	}

	return { occurrenceId, date, record: n.kind === 'residency' ? `/residencies/${n.id}` : `/occurrences/${n.id}` };
}
