import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attendanceTarget, attendanceVerdict, vouchState, vouchExpiry } from './vouch.ts';
import type { Register, Row } from './week.ts';

// ── Where Friday's attendance goes ──
const today = '2026-11-08';
const nights = (register: Register, n: number, attendedAt: string | null = null, state: Row['state'] = 'publishable') =>
	Array.from({ length: n }, (_, i) => ({ key: `${register}-${i}`, register, state, attendedAt: i === 0 ? attendedAt : null }) as Row);
const target = (rows: Row[]) => attendanceTarget(rows, today);

test('1. a register with no entries at all outranks everything — and the verdict calls it a gate failure', () => {
	const t = target([...nights('CHILL', 0), ...nights('SOCIAL', 1, '2026-01-01'), ...nights('HIGH_ENERGY', 13, '2026-11-07')]);
	assert.equal(t.target, 'CHILL');
	assert.equal(t.reason, 'absent');
	assert.match(attendanceVerdict(t), /^No Chill entries this week — the gate fails on mood balance/);
});

test('a night that cannot publish is not an entry, so it does not fill the register', () => {
	const t = target([...nights('CHILL', 3, '2026-11-01', 'lead'), ...nights('SOCIAL', 2), ...nights('HIGH_ENERGY', 2)]);
	assert.equal(t.target, 'CHILL');
	assert.equal(t.reason, 'absent');
	assert.equal(t.registers[0].daysSince, 7); // freshness still reads every night of the register
});

test('2. fewest entries leads, whatever the freshness says', () => {
	// Chill was attended yesterday; it is still the starving register at 2 against 13.
	const t = target([...nights('CHILL', 2, '2026-11-07'), ...nights('SOCIAL', 6, '2026-08-17'), ...nights('HIGH_ENERGY', 13, '2026-09-09')]);
	assert.equal(t.target, 'CHILL');
	assert.equal(t.reason, 'fewest');
	assert.equal(attendanceVerdict(t), 'Chill is thinnest — 2 nights, last attended yesterday. Point Friday’s attendance at Chill.');
});

test('3. a tie on count breaks on days since a fresh entry, longest first', () => {
	const t = target([...nights('CHILL', 4, '2026-10-30'), ...nights('SOCIAL', 4, '2026-09-24'), ...nights('HIGH_ENERGY', 9, '2026-01-01')]);
	assert.deepEqual(t.ranked.map((n) => [n.register, n.count, n.daysSince]), [['SOCIAL', 4, 45], ['CHILL', 4, 9], ['HIGH_ENERGY', 9, 311]]);
	assert.equal(t.reason, 'stale');
	assert.match(attendanceVerdict(t), /^Social and Chill tie on 4 nights; Social has gone longer without a fresh entry — last attended 45 days ago/);
});

test('4. never attended counts as infinitely long ago — it sorts worst on freshness', () => {
	const t = target([...nights('CHILL', 3, '2025-01-01'), ...nights('SOCIAL', 3, null), ...nights('HIGH_ENERGY', 3, '2026-11-01')]);
	assert.deepEqual(t.ranked.map((n) => n.register), ['SOCIAL', 'CHILL', 'HIGH_ENERGY']);
	assert.equal(t.registers.find((n) => n.register === 'SOCIAL')!.daysSince, null);
	assert.match(attendanceVerdict(t), /Social has gone longer without a fresh entry — never attended/);
});

test('live vouches are not in the ranking: three at zero live no longer send it to the loudest mood', () => {
	// Every vouch long expired: the old rule tied on zero and named High-Energy.
	const t = target([...nights('CHILL', 2, '2026-06-01'), ...nights('SOCIAL', 5, '2026-06-01'), ...nights('HIGH_ENERGY', 13, '2026-06-01')]);
	assert.equal(t.target, 'CHILL');
});

test('never attended is NONE', () => assert.equal(vouchState(null, '2026-10-26'), 'NONE'));

test('under 4 weeks is LIVE; 4–6 weeks EXPIRING; 6+ EXPIRED', () => {
	assert.equal(vouchState('2026-10-19', '2026-10-26'), 'LIVE');
	assert.equal(vouchState('2026-10-19', '2026-11-16'), 'EXPIRING'); // exactly 4 weeks
	assert.equal(vouchState('2026-10-19', '2026-11-23'), 'EXPIRING');
	assert.equal(vouchState('2026-10-19', '2026-11-30'), 'EXPIRED'); // exactly 6 weeks
});

test('a vouch expiring on the Wednesday of the build week is EXPIRING all week', () => {
	// Week of Mon 30 Nov; attended Wed 21 Oct expires Wed 2 Dec.
	assert.equal(vouchState('2026-10-21', '2026-11-30'), 'EXPIRING');
});

test('expiry in plain language', () => {
	assert.equal(vouchExpiry('2026-10-19', '2026-10-21'), 'vouch expires Mon 30 Nov');
	assert.equal(vouchExpiry('2026-10-19', '2026-12-12'), 'expired 12 days ago');
});
