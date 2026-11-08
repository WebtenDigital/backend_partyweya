// npm run test:db — the planned visit, against the real database. Every test
// builds its own venue and nights inside a transaction and rolls it back.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createPrisma, type Tx } from '../src/lib/server/db.ts';
import { changeVisit, dismissVisit, planVisit, visitsDue, weekVisit } from '../src/lib/server/visits.ts';
import { recordVisit, type VisitInput } from '../src/lib/server/visit.ts';
import { loadWeek } from '../src/lib/server/register.ts';
import { addDays, kampalaToday, nextMonday } from '../src/lib/build/week.ts';
import { isoDay, mondayOf } from '../src/lib/build/add.ts';
import { use, reset, disconnect } from './support/prisma.ts';

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

const lastOn = (dow: number) => addDays(today, -((isoDay(today) - dow + 7) % 7));
const next = nextMonday(today);

async function venueWithNight(tx: Tx, id: string, dayOfWeek = 6) {
	const v = await tx.venue.create({
		data: { id: `zz-plan-${id}`, name: `ZZ Plan ${id}`, phones: ['0772 000003'], conversationTest: 'ONLY_AT_THE_EDGES', provisionalRegister: 'SOCIAL', conversationTestAt: new Date() }
	});
	const r = await tx.residency.create({
		data: { id: `${v.id}-night`, venueId: v.id, eventName: `ZZ ${id}`, category: 'LIVE_BAND', dayOfWeek, startTime: '21:30', priceGate: 0, register: 'CHILL', lastConfirmed: new Date() }
	});
	return { v, r };
}

const writeUp = (ref: string, date: string, o: Partial<VisitInput> = {}): VisitInput => ({
	ref, date, arrivedAt: '22:00', leftAt: '01:00', clears: true, register: 'CHILL', nothingDiffered: true,
	actualStartTime: null, actualPrice: null, actualLineup: [], correct: { start: false, price: false, lineup: false },
	vettedNote: null, leads: [], costEntry: null, costTransport: null, costSpend: null, initials: 'YSM', today, ...o
});
const mine = (list: { id: string }[], id: string) => list.some((x) => x.id === id);

test('a planned visit is invisible to buildWeek: same publishable count, no override, no Occurrence', () =>
	rolledBack(async (tx) => {
		const { r } = await venueWithNight(tx, 'invisible');
		const before = await loadWeek(next, tx);
		const occurrencesBefore = await tx.occurrence.count();
		await planVisit(tx, { ref: r.id, date: addDays(next, 5), register: 'CHILL' });
		const afterWeek = await loadWeek(next, tx);
		assert.equal(afterWeek.rows.filter((x) => x.state === 'publishable').length, before.rows.filter((x) => x.state === 'publishable').length);
		assert.equal(afterWeek.rows.find((x) => x.residencyId === r.id)!.kind, 'STANDING');
		assert.equal(await tx.occurrence.count(), occurrencesBefore);
		assert.equal((await weekVisit(next, tx))!.ref, r.id); // …and the rail shows it
	}));

test('the badge counts a past, undismissed, unwritten visit — and drops to zero when the write-up saves', () =>
	rolledBack(async (tx) => {
		const { r } = await venueWithNight(tx, 'badge');
		const date = lastOn(6);
		const visit = await planVisit(tx, { ref: r.id, date, register: 'CHILL' });
		assert.equal(mine(await visitsDue(today, tx), visit.id), true);
		await recordVisit(tx, writeUp(r.id, date));
		assert.equal(mine(await visitsDue(today, tx), visit.id), false);
		assert.equal((await weekVisit(mondayOf(date), tx))!.writtenUp, true);
	}));

test('a future visit is not yet due', () =>
	rolledBack(async (tx) => {
		const { r } = await venueWithNight(tx, 'future');
		const visit = await planVisit(tx, { ref: r.id, date: addDays(next, 5), register: 'CHILL' });
		assert.equal(mine(await visitsDue(today, tx), visit.id), false);
	}));

test('a dismissed visit never appears in the badge or on the rail', () =>
	rolledBack(async (tx) => {
		const { r } = await venueWithNight(tx, 'dismissed');
		const date = lastOn(6);
		const visit = await planVisit(tx, { ref: r.id, date, register: 'CHILL' });
		await dismissVisit(tx, visit.id);
		assert.equal(mine(await visitsDue(today, tx), visit.id), false);
		assert.equal(await weekVisit(mondayOf(date), tx), null);
	}));

test('a second visit in a week is refused while one stands — changing the night moves the same one', () =>
	rolledBack(async (tx) => {
		const { r } = await venueWithNight(tx, 'one-a-week', 6);
		const { r: other } = await venueWithNight(tx, 'one-a-week-2', 4);
		const first = await planVisit(tx, { ref: r.id, date: addDays(next, 5), register: 'CHILL' });
		await assert.rejects(planVisit(tx, { ref: other.id, date: addDays(next, 3), register: 'CHILL' }), /already planned that week/);
		await changeVisit(tx, first.id, { ref: other.id, date: addDays(next, 3) });
		assert.equal(await tx.visit.count({ where: { dismissedAt: null, date: { gte: new Date(next), lte: new Date(addDays(next, 6)) } } }), 1);
		assert.equal((await weekVisit(next, tx))!.ref, other.id);
		await dismissVisit(tx, first.id);
		await planVisit(tx, { ref: r.id, date: addDays(next, 5), register: 'CHILL' }); // free again once dismissed
	}));

test('observedConversation saves; a write-up without it still saves with everything else intact', () =>
	rolledBack(async (tx) => {
		const { r } = await venueWithNight(tx, 'observed');
		const { r: second } = await venueWithNight(tx, 'observed-not', 6);
		const date = lastOn(6);
		const a = await recordVisit(tx, writeUp(r.id, date, { observedConversation: 'NO', register: 'HIGH_ENERGY', vettedNote: 'Loud from ten.' }));
		const b = await recordVisit(tx, writeUp(second.id, date, { observedConversation: undefined, vettedNote: 'Talkable till late.' }));
		const [oa, ob] = await Promise.all([a, b].map((x) => tx.occurrence.findUniqueOrThrow({ where: { id: x.occurrenceId } })));
		assert.equal(oa.observedConversation, 'NO');
		assert.equal(ob.observedConversation, null);
		assert.equal(ob.claimType, 'VETTED');
		assert.equal(ob.register, 'CHILL');
		assert.equal(ob.vettedNote, 'Talkable till late.');
	}));

test('observedConversation never touches the venue’s conversationTest or provisionalRegister', () =>
	rolledBack(async (tx) => {
		const { v, r } = await venueWithNight(tx, 'no-touch');
		await recordVisit(tx, writeUp(r.id, lastOn(6), { observedConversation: 'CAN_TALK', register: 'CHILL' }));
		const after = await tx.venue.findUniqueOrThrow({ where: { id: v.id } });
		assert.equal(after.conversationTest, 'ONLY_AT_THE_EDGES');
		assert.equal(after.provisionalRegister, 'SOCIAL');
		assert.equal(+after.conversationTestAt!, +v.conversationTestAt!);
	}));

test('a visit points at exactly one night: the database refuses both or neither', () =>
	rolledBack(async (tx) => {
		await assert.rejects(tx.visit.create({ data: { date: new Date(today) } }), /visit_one_night/);
	}));
