// node --test src/lib/build/asked.test.ts — no database needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CALL_OWNED, notAsked, originLabel, registerOrigin, type AskedNight } from './asked.ts';
import { resolvePerks, type PerkIn } from './week.ts';

const blank: AskedNight = { kind: 'standing', startTime: null, endTime: null, priceGate: null, priceAdvance: null, perks: [], categoryAskedAt: null, runningSince: null, lineup: [] };
const nobody = { conversationTest: null, contactName: null, contactRole: null };

test('every call-owned field with nothing in it is NOT ASKED YET', () => {
	assert.deepEqual([...notAsked(blank, nobody)].sort(), [...CALL_OWNED].sort());
});

test('a field with an answer is not flagged — and a free night (gate 0) is an answer', () => {
	const night: AskedNight = { ...blank, startTime: '21:00', endTime: '02:00', priceGate: 0, priceAdvance: 15000, perks: [{}], categoryAskedAt: '2026-11-11', runningSince: '2025-03-01', lineup: ['The Clan'] };
	assert.deepEqual([...notAsked(night, { conversationTest: 'NO', contactName: 'Moses', contactRole: 'MANAGER' })], []);
});

test('"no offers" is an answer: recorded, it stops being asked', () => {
	assert.ok(notAsked(blank, nobody).has('perks'));
	assert.ok(!notAsked({ ...blank, offersAskedAt: '2026-11-11' }, nobody).has('perks'));
	assert.ok(!notAsked({ ...blank, perks: [{}] }, nobody).has('perks')); // offers already on file answer it too
});

test('category: asked once of a standing night, then gone; a dated night asks it every time', () => {
	assert.ok(notAsked(blank, nobody).has('category'));
	assert.ok(!notAsked({ ...blank, categoryAskedAt: '2026-11-11' }, nobody).has('category'));
	const dated = notAsked({ ...blank, kind: 'dated' }, nobody);
	assert.ok(!dated.has('category') && !dated.has('runningSince'));
});

test('with no night selected, only the venue’s gaps show', () => {
	assert.deepEqual([...notAsked(null, nobody)].sort(), ['contactName', 'contactRole', 'conversationTest']);
});

test('a register from the category, from question 6, and from the room read three different ways', () => {
	const venue = { conversationTest: 'CAN_TALK', provisionalRegister: 'CHILL' };
	const guess = registerOrigin({ register: 'CHILL', attendedAt: null, source: 'OWNER' }, { conversationTest: null, provisionalRegister: null });
	const q6 = registerOrigin({ register: 'CHILL', attendedAt: null, source: 'OWNER' }, venue);
	const room = registerOrigin({ register: 'CHILL', attendedAt: '2026-10-21', source: 'ATTENDED' }, venue);
	assert.deepEqual([guess.kind, q6.kind, room.kind], ['guess', 'q6', 'room']);
	assert.deepEqual([originLabel(guess), originLabel(q6), originLabel(room)], ['guessed from category', 'from question 6', 'judged in the room, 21 Oct']);
});

test('a register that disagrees with the venue’s question-6 answer is still a guess', () => {
	// Buffaloes' Old Skool Wednesday: SOCIAL on file, the venue said "no" (High-Energy), nobody went.
	const o = registerOrigin({ register: 'SOCIAL', attendedAt: null, source: 'SOCIAL_MEDIA' }, { conversationTest: 'NO', provisionalRegister: 'HIGH_ENERGY' });
	assert.equal(o.kind, 'guess');
});

test('a one-off offer on a standing night’s date adds to the weekly ones, not instead of them', () => {
	const perk = (label: string, sortOrder = 0, activeUntil: string | null = null): PerkIn => ({ kind: 'DRINK', label, condition: null, activeUntil, sortOrder });
	const weekly = [perk('5 beers at 25K'), perk('Ended deal', 1, '2026-11-01')];
	const once = [perk('Free entry before 9'), perk('5 Beers at 25K')];
	assert.deepEqual(resolvePerks('2026-11-14', once, weekly).map((p) => p.label), ['5 beers at 25K', 'Free entry before 9']);
	assert.deepEqual(resolvePerks('2026-11-14', null, weekly).map((p) => p.label), ['5 beers at 25K']);
});
