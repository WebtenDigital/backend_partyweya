// node --test src/lib/build/prediction.test.ts — no database needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPrediction } from './prediction.ts';

test('a prediction that held', () => {
	assert.equal(readPrediction({ predictedRegister: 'SOCIAL', predictedFrom: 'ONLY_AT_THE_EDGES', judged: 'SOCIAL', observed: null })!.verdict, 'held');
});

test('the room answered as the venue did, yet the register differed: the mapping table is wrong', () => {
	const r = readPrediction({ predictedRegister: 'SOCIAL', predictedFrom: 'ONLY_AT_THE_EDGES', judged: 'HIGH_ENERGY', observed: 'ONLY_AT_THE_EDGES' })!;
	assert.equal(r.verdict, 'mapping');
});

test('the room answered differently from the venue: the venue was wrong', () => {
	const r = readPrediction({ predictedRegister: 'SOCIAL', predictedFrom: 'ONLY_AT_THE_EDGES', judged: 'HIGH_ENERGY', observed: 'NO' })!;
	assert.equal(r.verdict, 'venue');
});

test('a miss with no observed answer can’t say which', () => {
	assert.equal(readPrediction({ predictedRegister: 'SOCIAL', predictedFrom: 'ONLY_AT_THE_EDGES', judged: 'HIGH_ENERGY', observed: null })!.verdict, 'unknown');
});

test('nothing predicted, nothing to read', () => {
	assert.equal(readPrediction({ predictedRegister: null, predictedFrom: null, judged: 'CHILL', observed: 'CAN_TALK' }), null);
});
