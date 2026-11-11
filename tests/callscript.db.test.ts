// npm run test:db — the revised call script, through the call screen's own
// save action, against the real database. Every test builds its own venue
// inside a transaction and rolls it back.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createPrisma, type Tx } from '../src/lib/server/db.ts';
import { addDays, kampalaToday, nextMonday } from '../src/lib/build/week.ts';
import { notAsked } from '../src/lib/build/asked.ts';
import { createNights, nightsFrom } from '../src/lib/server/nights.ts';
import { use, reset, disconnect } from './support/prisma.ts';
import { actions, load } from '../src/routes/(app)/calls/[venueId]/+page.server.ts';

const db = createPrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL!);
after(async () => {
	await db.$disconnect();
	await disconnect();
});

const today = kampalaToday();
const week = nextMonday(today);
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

const setup = async (tx: Tx, id: string) => {
	const v = await tx.venue.create({ data: { id: `zz-call-${id}`, name: `ZZ Call ${id}`, zoneName: 'KABALAGALA–MUYENGA' } });
	const r = await tx.residency.create({
		data: { id: `zz-call-${id}-sat`, venueId: v.id, eventName: 'Delirio Saturdays', category: 'THEMED_NIGHT', dayOfWeek: 6, register: 'HIGH_ENERGY' }
	});
	return { v, r };
};

type Offer = { id?: string; label: string; scope?: 'weekly' | 'once'; confirmed?: boolean };
/** A reached call to the venue, as the screen posts it: blank fields are blank strings. */
function call(fields: Record<string, string>, offers: Offer[] | null = []) {
	const f = new FormData();
	for (const [k, v] of Object.entries({ outcome: 'reached', dial: 'venue', source: 'OWNER', week, s_start: '', s_end: '', s_gate: '', s_advance: '', s_since: '', s_category: '', ...fields })) f.set(k, v);
	if (offers) {
		f.set('perks_sent', '1');
		for (const o of offers) {
			for (const [k, v] of Object.entries({ id: o.id ?? '', kind: 'DRINK', label: o.label, condition: '', until: '', scope: o.scope ?? '', confirmed: o.confirmed ? '1' : '' }))
				f.append(`perk_${k}`, v);
		}
	}
	return f;
}
const save = (venueId: string, f: FormData) =>
	(actions.save as any)({ params: { venueId }, request: new Request('http://x/', { method: 'POST', body: f }) }).then(
		(r: any) => assert.fail(`the call didn’t save: ${r?.data?.error}`),
		(e: any) => {
			if (e?.status !== 303) throw e; // the redirect after a saved call
		}
	);

test('a weekly offer goes on the standing night; a one-off goes on that week’s date of it', () =>
	rolledBack(async (tx) => {
		const { v, r } = await setup(tx, 'scope');
		await save(v.id, call({ mode: 'standing', residencyId: r.id }, [
			{ label: '5 beers at 25K', scope: 'weekly', confirmed: true },
			{ label: 'Free entry before 9', scope: 'once', confirmed: true }
		]));
		const onRule = await tx.perk.findMany({ where: { residencyId: r.id } });
		assert.deepEqual(onRule.map((p) => p.label), ['5 beers at 25K']);
		const date = addDays(week, 5); // Saturday of the week being built
		const o = await tx.occurrence.findFirstOrThrow({ where: { residencyId: r.id }, include: { perks: true } });
		assert.equal(o.date.toISOString().slice(0, 10), date);
		assert.deepEqual(o.perks.map((p) => p.label), ['Free entry before 9']);
		assert.equal(o.status, 'CONFIRMED'); // the date doesn't drop to unconfirmed for want of a row
		assert.equal(o.startTime, null); //     everything else falls through to the rule
	}));

test('on a standing night’s date, "every week" moves the offer to the rule', () =>
	rolledBack(async (tx) => {
		const { v, r } = await setup(tx, 'dated-scope');
		const date = addDays(week, 5);
		const o = await tx.occurrence.create({ data: { id: `${r.id}-${date}`, venueId: v.id, residencyId: r.id, date: new Date(`${date}T00:00:00Z`), eventName: r.eventName, category: r.category } });
		await save(v.id, call({ mode: 'dated', occurrenceId: o.id, d_date: date, d_name: r.eventName, d_category: 'DJ', d_start: '', d_end: '', d_gate: '', d_advance: '', d_note: '', d_register: '' }, [
			{ label: 'Ladies free', scope: 'weekly', confirmed: true },
			{ label: 'Launch shots', scope: 'once', confirmed: true }
		]));
		assert.deepEqual((await tx.perk.findMany({ where: { residencyId: r.id } })).map((p) => p.label), ['Ladies free']);
		assert.deepEqual((await tx.perk.findMany({ where: { occurrenceId: o.id } })).map((p) => p.label), ['Launch shots']);
	}));

test('an offer carries its own confirmation: the night’s moves on every call, the offer’s only when heard', () =>
	rolledBack(async (tx) => {
		const { v, r } = await setup(tx, 'confirm');
		const old = await tx.perk.create({ data: { residencyId: r.id, kind: 'DRINK', label: '20% off rum, whiskey, gin and vodka' } });
		await save(v.id, call({ mode: 'standing', residencyId: r.id }, [
			{ id: old.id, label: old.label, scope: 'weekly' }, //            kept, not ticked as still on
			{ label: 'Quiz entry free', scope: 'weekly', confirmed: true } // new: heard on this call
		]));
		const night = await tx.residency.findUniqueOrThrow({ where: { id: r.id } });
		assert.ok(night.lastConfirmed);
		const perks = await tx.perk.findMany({ where: { residencyId: r.id }, orderBy: { sortOrder: 'asc' } });
		assert.equal(perks[0].confirmedOn, null);
		assert.ok(perks[1].confirmedOn);
		assert.equal(perks[1].confirmedBy, 'TEST'); // CALLER_NAME, never typed

		await save(v.id, call({ mode: 'standing', residencyId: r.id }, [{ id: old.id, label: old.label, scope: 'weekly', confirmed: true }, { id: perks[1].id, label: perks[1].label, scope: 'weekly' }]));
		const again = await tx.perk.findMany({ where: { residencyId: r.id }, orderBy: { sortOrder: 'asc' } });
		assert.ok(again[0].confirmedOn); //                                     ticked: confirmed now
		assert.equal(+again[1].confirmedOn!, +perks[1].confirmedOn!); //       not ticked: its date stands
	}));

test('category saves, and the question is gone from the next call to that venue', () =>
	rolledBack(async (tx) => {
		const { v, r } = await setup(tx, 'category');
		const before: any = await (load as any)({ params: { venueId: v.id }, url: new URL(`http://x/calls/${v.id}?ref=${r.id}`) });
		const night = (d: any) => ({ kind: 'standing' as const, ...d.residencies[0] });
		assert.ok(notAsked(night(before), before.venue).has('category'));
		await save(v.id, call({ mode: 'standing', residencyId: r.id, s_category: 'LIVE_BAND' }));
		const next: any = await (load as any)({ params: { venueId: v.id }, url: new URL(`http://x/calls/${v.id}?ref=${r.id}`) });
		assert.equal(next.residencies[0].category, 'LIVE_BAND');
		assert.ok(!notAsked(night(next), next.venue).has('category'));
		assert.equal((await tx.residency.findUniqueOrThrow({ where: { id: r.id } })).register, 'HIGH_ENERGY'); // a tag, never the mood
	}));

test('a call saves with every new field left blank, and blanks nothing', () =>
	rolledBack(async (tx) => {
		const { v, r } = await setup(tx, 'blank');
		await tx.residency.update({ where: { id: r.id }, data: { priceGate: 20000, startTime: '21:00' } });
		await save(v.id, call({ mode: 'standing', residencyId: r.id }, []));
		const after = await tx.residency.findUniqueOrThrow({ where: { id: r.id } });
		assert.deepEqual([after.priceGate, after.priceAdvance, after.startTime, after.category, after.categoryAskedAt], [20000, null, '21:00', 'THEMED_NIGHT', null]);
		assert.equal(await tx.perk.count({ where: { residencyId: r.id } }), 0);
		assert.ok(after.lastConfirmed);
	}));

test('an advance price is kept, and refused if it isn’t cheaper than the gate', () =>
	rolledBack(async (tx) => {
		const { v, r } = await setup(tx, 'advance');
		await save(v.id, call({ mode: 'standing', residencyId: r.id, s_gate: '30000', s_advance: '20000' }));
		assert.equal((await tx.residency.findUniqueOrThrow({ where: { id: r.id } })).priceAdvance, 20000);
		const res: any = await (actions.save as any)({ params: { venueId: v.id }, request: new Request('http://x/', { method: 'POST', body: call({ mode: 'standing', residencyId: r.id, s_advance: '30000' }) }) });
		assert.match(res.data.error, /cheaper than the gate/);
	}));

test('question 6 no longer overwrites a register judged in the room', () =>
	rolledBack(async (tx) => {
		const { v, r } = await setup(tx, 'q6-room');
		const other = await tx.residency.create({ data: { id: `${r.id}-fri`, venueId: v.id, eventName: 'Fridays', category: 'DJ', dayOfWeek: 5, register: 'HIGH_ENERGY' } });
		await tx.residency.update({ where: { id: r.id }, data: { register: 'SOCIAL', attendedAt: new Date(`${addDays(today, -3)}T00:00:00Z`), source: 'ATTENDED', claimType: 'VETTED' } });
		await save(v.id, call({ mode: 'none', q6: 'CAN_TALK' }, null));
		assert.equal((await tx.residency.findUniqueOrThrow({ where: { id: r.id } })).register, 'SOCIAL'); // the room's
		assert.equal((await tx.residency.findUniqueOrThrow({ where: { id: other.id } })).register, 'CHILL'); // the phone's
	}));

test('discovery: each night block’s offers land on that night — weekly on the residency, one-off on its date', () =>
	rolledBack(async (tx) => {
		const v = await tx.venue.create({ data: { id: 'zz-call-discover', name: 'ZZ Call discover', zoneName: 'KABALAGALA–MUYENGA' } });
		const f = new FormData();
		const date = addDays(today, 4);
		const blocks = [
			{ name: 'Rumba Thursdays', category: 'LIVE_BAND', recurrence: 'WEEKLY', day: '4', date: '', offers: ['Glass of wine at 15K'] },
			{ name: 'Launch Night', category: 'DJ', recurrence: 'ONE_OFF', day: '', date, offers: ['Free shot on entry', 'Ladies free before 10'] }
		];
		for (const b of blocks) {
			for (const [k, val] of Object.entries({ name: b.name, category: b.category, recurrence: b.recurrence, day: b.day, date: b.date, start: '21:00', end: '', gate: '', advance: '', since: '', lineup: '', register: 'SOCIAL' })) f.append(`n_${k}`, val);
			f.append('n_perk_count', String(b.offers.length));
			f.append('n_perks_sent', '1');
			for (const label of b.offers) for (const [k, val] of Object.entries({ id: '', kind: 'DRINK', label, condition: '', until: '', scope: '', confirmed: '1' })) f.append(`n_perk_${k}`, val);
		}
		const made = await createNights(tx, v.id, nightsFrom(f, today, { register: null, dates: 'ahead' }), { source: 'OWNER', confirmed: { at: new Date(), by: 'TEST' } });
		const [res, occ] = made;
		assert.deepEqual((await tx.perk.findMany({ where: { residencyId: res.ref } })).map((p) => p.label), ['Glass of wine at 15K']);
		const onDate = await tx.perk.findMany({ where: { occurrenceId: occ.ref }, orderBy: { sortOrder: 'asc' } });
		assert.deepEqual(onDate.map((p) => p.label), ['Free shot on entry', 'Ladies free before 10']);
		assert.ok(onDate.every((p) => p.confirmedOn && p.confirmedBy === 'TEST'));
		assert.ok((await tx.residency.findUniqueOrThrow({ where: { id: res.ref } })).categoryAskedAt);
	}));
