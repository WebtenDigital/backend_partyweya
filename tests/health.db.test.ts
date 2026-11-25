// npm run test:db — register health against the real register: every count
// on the panel matches a direct query of the database.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createPrisma } from '../src/lib/server/db.ts';
import { addDays, kampalaToday } from '../src/lib/build/week.ts';
import { registerHealth } from '../src/lib/server/tier.ts';
import { kampalaDate } from '../src/lib/server/register.ts';

const db = createPrisma(process.env.DIRECT_URL ?? process.env.DATABASE_URL!);
after(() => db.$disconnect());

test('register health counts match a direct query of the register', async () => {
	const today = kampalaToday();
	const book = await db.residency.findMany({
		where: { active: true },
		select: { eventName: true, startTime: true, register: true, lastConfirmed: true, runningSince: true, firstConfirmedAt: true, rotatingAct: true, venue: { select: { name: true } } }
	});
	const h = registerHealth(
		book.map((n) => ({
			kind: 'standing' as const, venue: n.venue.name, eventName: n.eventName, startTime: n.startTime, register: n.register,
			lastConfirmed: kampalaDate(n.lastConfirmed), runningSince: kampalaDate(n.runningSince), firstConfirmedAt: kampalaDate(n.firstConfirmedAt), rotating: n.rotatingAct
		})),
		today
	);
	const [{ total, never, last30, week }] = await db.$queryRaw<{ total: bigint; never: bigint; last30: bigint; week: bigint }[]>`
		SELECT count(*) AS total,
		       count(*) FILTER (WHERE "lastConfirmed" IS NULL) AS never,
		       count(*) FILTER (WHERE ("lastConfirmed" AT TIME ZONE 'Africa/Kampala')::date > ${addDays(today, -30)}::date) AS last30,
		       count(*) FILTER (WHERE ("lastConfirmed" AT TIME ZONE 'Africa/Kampala')::date >= date_trunc('week', ${today}::date)::date
		                          AND ("lastConfirmed" AT TIME ZONE 'Africa/Kampala')::date <= ${today}::date) AS week
		FROM "Residency" WHERE active`;
	assert.deepEqual([h.total, h.never, h.last30, h.thisWeek], [Number(total), Number(never), Number(last30), Number(week)]);
	assert.ok(h.publishable <= h.total - h.never);
	assert.equal(h.heldOnRecord + h.heldOnWord, h.publishable);
	console.log(`# health ${today}: publishable ${h.publishable}/${h.total}, never ${h.never}, this week ${h.thisWeek}/${h.needed}, last 30 ${h.last30}, oldest lapsed ${JSON.stringify(h.oldestLapsed)}, held on our record ${h.heldOnRecord}, on their word ${h.heldOnWord}, red ${h.red}`);
});
