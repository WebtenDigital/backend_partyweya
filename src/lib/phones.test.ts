// node --test src/lib/phones.test.ts — no database needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answeredOn, dialNumber, showPhones, splitPhones, withPhones } from './phones.ts';

test('a bio’s two numbers paste straight in, by slash or comma', () => {
	assert.deepEqual(splitPhones('0773814441 / 0703944142'), ['0773814441', '0703944142']);
	assert.deepEqual(splitPhones('0773814441, 0703944142'), ['0773814441', '0703944142']);
	assert.deepEqual(splitPhones(' 0773814441 /, / 0703944142 / 0773 814441 '), ['0773814441', '0703944142']);
	assert.deepEqual(splitPhones(''), []);
	assert.equal(showPhones(['0773814441', '0703944142']), '0773814441 / 0703944142');
});

test('dial the answered number, else the first', () => {
	assert.equal(dialNumber({ phones: ['a1', 'b2'], verifiedPhone: null }), 'a1');
	assert.equal(dialNumber({ phones: ['a1', 'b2'], verifiedPhone: 'b2' }), 'b2');
	assert.equal(dialNumber({ phones: [], verifiedPhone: null }), null);
});

test('verification survives a reorder or an added number, not a change to it', () => {
	const v = { phones: ['0773814441'], verifiedPhone: '0773814441' };
	assert.deepEqual(withPhones(v, ['0703944142', '0773814441']), { phones: ['0703944142', '0773814441'], verifiedPhone: '0773814441' });
	assert.deepEqual(withPhones(v, ['0773 814441']), { phones: ['0773 814441'], verifiedPhone: '0773 814441' });
	assert.deepEqual(withPhones(v, ['0773814442']), { phones: ['0773814442'], verifiedPhone: null, phoneVerifiedAt: null });
	assert.deepEqual(withPhones(v, []), { phones: [], verifiedPhone: null, phoneVerifiedAt: null });
});

test('reached on the second number: it becomes verified and moves to the front', () => {
	assert.deepEqual(answeredOn(['0773814441', '0703944142'], '0703944142'), {
		phones: ['0703944142', '0773814441'],
		verifiedPhone: '0703944142'
	});
});
