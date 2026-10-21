import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vouchState, vouchExpiry } from './vouch.ts';

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
