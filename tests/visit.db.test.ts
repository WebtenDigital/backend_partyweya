// npm run test:db — the visit write-up, against the real database. Every test
// builds its own venue and nights inside a transaction and rolls it back.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createPrisma, type Tx } from '../src/lib/server/db.ts';
import { recordVisit, type VisitInput } from '../src/lib/server/visit.ts';
import { loadWeek } from '../src/lib/server/register.ts';
import { entryOf, proposeTikTok } from '../src/lib/build/roundup.ts';
import { addDays, kampalaToday, nextMonday } from '../src/lib/build/week.ts';
import { isoDay } from '../src/lib/build/add.ts';
import { use, reset, disconnect } from './support/prisma.ts';
import { actions as callActions } from '../src/routes/(app)/calls/[venueId]/+page.server.ts';

const db = createPrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL!);
after(async () => {
	await db.$disconnect();
	await disconnect();
});

const today = kampalaToday();
class Rollback extends Error {}
async function rolledBack(fn: (tx: Tx) => Promise<void>) {
	await db
		.$transaction(
			async (tx) => {
				use(tx);
				try {
					await fn(tx);
				} finally {
					reset();
				}
				throw new Rollback();
			},
			{ timeout: 120_000, maxWait: 20_000 }
		)
		.catch((e) => {
			if (!(e instanceof Rollback)) throw e;
		});
}

/** The last date on or before today that falls on ISO weekday `dow`. */
const lastOn = (dow: number) => addDays(today, -((isoDay(today) - dow + 7) % 7));
const asDate = (d: string) => new Date(`${d}T00:00:00Z`);

const venue = (tx: Tx, id: string, data: Record<string, unknown> = {}) =>
	tx.venue.create({
		data: { id: `zz-visit-${id}`, name: `ZZ Visit ${id}`, phones: ['0772 000002'], conversationTest: 'ONLY_AT_THE_EDGES', provisionalRegister: 'SOCIAL', conversationTestAt: asDate('2026-10-14'), ...data }
	});
const standing = (tx: Tx, venueId: string, name: string, dayOfWeek: number, data: Record<string, unknown> = {}) =>
	tx.residency.create({
		data: { id: `${venueId}-${name}`, venueId, eventName: `ZZ ${name}`, category: 'LIVE_BAND', dayOfWeek, startTime: '21:30', priceGate: 20000, lineup: ['Band'], register: 'SOCIAL', lastConfirmed: new Date(), ...data }
	});

const visit = (ref: string, date: string, o: Partial<VisitInput> = {}): VisitInput => ({
	ref,
	date,
	arrivedAt: '22:15',
	leftAt: '01:30',
	clears: true,
	register: 'HIGH_ENERGY',
	nothingDiffered: false,
	actualStartTime: '23:00',
	actualPrice: 20000,
	actualLineup: ['Afrigo Band'],
	correct: { start: false, price: false, lineup: false },
	vettedNote: 'Loudest courtyard all week, and the band actually ends at 1.',
	leads: ['Poster: Tuesday quiz, 8pm, free entry'],
	costEntry: 20000,
	costTransport: 15000,
	costSpend: 45000,
	initials: 'YSM',
	today,
	...o
});

test('a standing night: the override Occurrence is materialised VETTED/ATTENDED, and the residency keeps the vouch for next week', () =>
	rolledBack(async (tx) => {
		const v = await venue(tx, 'standing');
		const date = lastOn(6);
		const r = await standing(tx, v.id, 'sat', 6);
		const { occurrenceId } = await recordVisit(tx, visit(r.id, date));

		const o = await tx.occurrence.findUniqueOrThrow({ where: { id: occurrenceId } });
		assert.equal(o.residencyId, r.id);
		assert.equal(o.date.toISOString().slice(0, 10), date);
		assert.equal(o.claimType, 'VETTED');
		assert.equal(o.source, 'ATTENDED');
		assert.equal(o.status, 'CONFIRMED');
		assert.equal(o.clearsF2, true);
		assert.equal(o.actualStartTime, '23:00');
		assert.deepEqual(o.actualLineup, ['Afrigo Band']);
		assert.deepEqual(o.mismatches, ['start: said 21:30, opened 23:00', 'lineup: said Band, was Afrigo Band']);
		assert.equal(o.vettedNote, 'Loudest courtyard all week, and the band actually ends at 1.');
		assert.equal(o.costSpend, 45000);

		// Nothing in the register moved without "correct the register too".
		const after = await tx.residency.findUniqueOrThrow({ where: { id: r.id } });
		assert.equal(after.startTime, '21:30');
		assert.deepEqual(after.lineup, ['Band']);
		assert.equal(after.claimType, 'VETTED');
		assert.equal(after.source, 'ATTENDED');
		assert.equal(after.attendedAt!.toISOString().slice(0, 10), date);

		// Next week's expanded row reads the residency's vouch.
		const { rows } = await loadWeek(nextMonday(today), tx);
		const next = rows.find((x) => x.residencyId === r.id)!;
		assert.equal(next.kind, 'STANDING');
		assert.equal(next.claimType, 'VETTED');
		assert.equal(next.attendedAt, date);

		// The poster reached the venue as a reminder for the next call.
		const reminders = await tx.reminder.findMany({ where: { venueId: v.id } });
		assert.deepEqual(reminders.map((x) => x.body), [`Seen at the visit on ${date}: Poster: Tuesday quiz, 8pm, free entry`]);
		// …and no Publication row was written.
		assert.equal(await tx.publication.count({ where: { occurrenceId } }), 0);
	}));

test('writing up the same standing night again updates the one override — never a second row', () =>
	rolledBack(async (tx) => {
		const v = await venue(tx, 'twice');
		const date = lastOn(6);
		const r = await standing(tx, v.id, 'sat', 6);
		const first = await recordVisit(tx, visit(r.id, date));
		const second = await recordVisit(tx, visit(r.id, date, { clears: false }));
		assert.equal(first.occurrenceId, second.occurrenceId);
		assert.equal(await tx.occurrence.count({ where: { residencyId: r.id } }), 1);
	}));

test('a one-off updates its existing Occurrence rather than creating a second', () =>
	rolledBack(async (tx) => {
		const v = await venue(tx, 'one-off');
		const date = addDays(today, -1);
		const o = await tx.occurrence.create({
			data: { id: 'zz-visit-launch', venueId: v.id, date: asDate(date), eventName: 'ZZ Launch', category: 'DJ', startTime: '22:00', status: 'CONFIRMED', source: 'OWNER', claimType: 'FACTUAL' }
		});
		const before = await tx.occurrence.count({ where: { venueId: v.id } });
		const { occurrenceId } = await recordVisit(tx, visit(o.id, date, { nothingDiffered: true }));
		assert.equal(occurrenceId, o.id);
		assert.equal(await tx.occurrence.count({ where: { venueId: v.id } }), before);
		const after = await tx.occurrence.findUniqueOrThrow({ where: { id: o.id } });
		assert.equal(after.claimType, 'VETTED');
		assert.equal(after.source, 'ATTENDED');
		assert.deepEqual(after.mismatches, []); // "nothing differed" records agreement, not three fields
	}));

test('the prediction is snapshotted; provisionalRegister is untouched; the judged register is set beside it', () =>
	rolledBack(async (tx) => {
		const v = await venue(tx, 'predict');
		const r = await standing(tx, v.id, 'sat', 6);
		const { occurrenceId } = await recordVisit(tx, visit(r.id, lastOn(6), { register: 'HIGH_ENERGY' }));
		const o = await tx.occurrence.findUniqueOrThrow({ where: { id: occurrenceId } });
		assert.equal(o.predictedRegister, 'SOCIAL');
		assert.equal(o.predictedFrom, 'ONLY_AT_THE_EDGES');
		const after = await tx.venue.findUniqueOrThrow({ where: { id: v.id } });
		assert.equal(after.provisionalRegister, 'SOCIAL'); // the guess stands
		assert.equal(after.conversationTest, 'ONLY_AT_THE_EDGES');
		assert.equal(after.register, 'HIGH_ENERGY'); //      the judgement, beside it
		assert.ok(after.registerJudgedAt);
	}));

test('a later question-6 answer on the call screen moves the guess and leaves the judgement alone', () =>
	rolledBack(async (tx) => {
		const v = await venue(tx, 'later-q6');
		const r = await standing(tx, v.id, 'sat', 6);
		await recordVisit(tx, visit(r.id, lastOn(6), { register: 'HIGH_ENERGY' }));
		const judged = await tx.venue.findUniqueOrThrow({ where: { id: v.id } });

		const f = new FormData();
		for (const [k, val] of Object.entries({ outcome: 'reached', mode: 'none', dial: 'venue', q6: 'CAN_TALK', week: nextMonday(today), source: 'OWNER' })) f.set(k, val);
		await (callActions.save as any)({ params: { venueId: v.id }, request: new Request('http://x/', { method: 'POST', body: f }) }).catch((e: any) => {
			if (e?.status !== 303) throw e; // the redirect after a saved call
		});

		const after = await tx.venue.findUniqueOrThrow({ where: { id: v.id } });
		assert.equal(after.conversationTest, 'CAN_TALK');
		assert.equal(after.provisionalRegister, 'CHILL'); // the guess moved
		assert.ok(after.conversationTestAt && +after.conversationTestAt > +judged.conversationTestAt!);
		assert.equal(after.register, 'HIGH_ENERGY'); //     the judgement did not
		assert.equal(+after.registerJudgedAt!, +judged.registerJudgedAt!);
	}));

test('a doesn’t-clear night is still VETTED, and it is never proposed as the strongest', () =>
	rolledBack(async (tx) => {
		const v = await venue(tx, 'fails');
		const r = await standing(tx, v.id, 'sat', 6, { register: 'CHILL' });
		const { occurrenceId } = await recordVisit(tx, visit(r.id, lastOn(6), { clears: false, register: 'CHILL' }));
		const o = await tx.occurrence.findUniqueOrThrow({ where: { id: occurrenceId } });
		assert.equal(o.claimType, 'VETTED');
		assert.equal(o.clearsF2, false);
		const { rows } = await loadWeek(nextMonday(today), tx);
		const row = rows.find((x) => x.residencyId === r.id)!;
		assert.equal(row.clearsF2, false);
		assert.notEqual(proposeTikTok([entryOf({ ...row, startTime: row.startTime ?? '21:30' })]).CHILL, row.key);
	}));

test('two nights at one venue keep two separate verdicts', () =>
	rolledBack(async (tx) => {
		const v = await venue(tx, 'two-nights');
		const sat = await standing(tx, v.id, 'sat', 6);
		const tue = await standing(tx, v.id, 'tue', 2, { category: 'QUIZ' });
		await recordVisit(tx, visit(sat.id, lastOn(6), { clears: true }));
		await recordVisit(tx, visit(tue.id, lastOn(2), { clears: false }));
		const [s, t] = await Promise.all([sat, tue].map((x) => tx.residency.findUniqueOrThrow({ where: { id: x.id } })));
		assert.equal(s.clearsF2, true);
		assert.equal(t.clearsF2, false);
	}));

test('a date off the night’s weekday is refused', () =>
	rolledBack(async (tx) => {
		const v = await venue(tx, 'weekday');
		const r = await standing(tx, v.id, 'sat', 6);
		await assert.rejects(recordVisit(tx, visit(r.id, lastOn(5))), /runs on Saturdays/);
	}));

test('VETTED with any source but ATTENDED is refused by the database', () =>
	rolledBack(async (tx) => {
		const v = await venue(tx, 'vetted-guard');
		await assert.rejects(
			tx.occurrence.create({
				data: { id: 'zz-visit-guard', venueId: v.id, date: asDate(today), eventName: 'ZZ Guard', category: 'DJ', source: 'OWNER', claimType: 'VETTED' }
			}),
			/vetted_means_attended/
		);
	}));
