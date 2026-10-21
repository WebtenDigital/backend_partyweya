// node --test src/lib/provenance.test.ts — no database needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claimFor, sourceAfter } from './provenance.ts';

test('attendance is VETTED, transferring act or not', () => {
	assert.equal(claimFor('ATTENDED', false), 'VETTED');
	assert.equal(claimFor('ATTENDED', true), 'VETTED');
});

test('a reader’s suggestion carries no claim, even billing a transferring act', () => {
	assert.equal(claimFor('AUDIENCE', false), null);
	assert.equal(claimFor('AUDIENCE', true), null);
});

test('no source, no claim — TRANSFERRED never rescues it', () => {
	assert.equal(claimFor(null, false), null);
	assert.equal(claimFor(null, true), null);
});

test('a plain source is FACTUAL', () => {
	for (const s of ['OWNER', 'MANAGER', 'PROMOTER', 'AGENT', 'ACT', 'TICKETING', 'SOCIAL_MEDIA', 'FLYER', 'PRESS'] as const)
		assert.equal(claimFor(s, false), 'FACTUAL', s);
});

test('a plain source billing a transferring act is TRANSFERRED', () => {
	assert.equal(claimFor('MANAGER', true), 'TRANSFERRED');
	assert.equal(claimFor('ACT', true), 'TRANSFERRED');
});

test('a source added later fails safe into FACTUAL', () => {
	assert.equal(claimFor('SOMETHING_NEW' as never, false), 'FACTUAL');
});

test('a call never overwrites attendance; otherwise the reported source stands', () => {
	assert.equal(sourceAfter('ATTENDED', 'MANAGER'), 'ATTENDED');
	assert.equal(sourceAfter('FLYER', 'MANAGER'), 'MANAGER');
	assert.equal(sourceAfter(null, 'OWNER'), 'OWNER');
});
