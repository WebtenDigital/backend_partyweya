// node --test src/lib/venues.test.ts — no database needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { similarVenues } from './venues.ts';

const register = [{ name: 'Cafesserie' }, { name: 'The Alchemist' }, { name: '1420' }, { name: 'Bada Bing' }];
const names = (n: string) => similarVenues(n, register).map((v) => v.name);

test('one character off is the same venue', () => {
	assert.deepEqual(names('Cafeserie'), ['Cafesserie']);
	assert.deepEqual(names('Cafesseria'), ['Cafesserie']);
	assert.deepEqual(names('1421'), ['1420']);
});

test('case, punctuation, spacing and a leading "the" are ignored', () => {
	assert.deepEqual(names('alchemist'), ['The Alchemist']);
	assert.deepEqual(names('THE  ALCHEMIST!'), ['The Alchemist']);
	assert.deepEqual(names('Bada-Bing'), ['Bada Bing']);
});

test('a different name is not a match', () => {
	assert.deepEqual(names('Zone 7 Bar'), []);
	assert.deepEqual(names('Cafe'), []);
	assert.deepEqual(names(''), []);
});
