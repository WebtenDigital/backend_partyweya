// node --test src/lib/build/roundup.test.ts — no database needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	LOCKED_TAGS,
	blockText,
	captionText,
	cleanTag,
	coverText,
	missingMoods,
	nights,
	ordered,
	placeTagClash,
	proposeTikTok,
	publicationTarget,
	zoneLabel,
	type Entry
} from './roundup.ts';

const entry = (o: Partial<Entry> & { key: string }): Entry => ({
	date: '2026-10-31', kind: 'ONE-OFF', residencyId: null, eventName: o.key, venue: 'Venue', zone: null, paidClient: false,
	category: 'DJ', startTime: '21:00', price: 'Free', register: 'SOCIAL', perk: null, claimType: 'FACTUAL', attendedAt: null, clearsF2: null, ...o
});

test('a block is the facts, then the line — one paste', () => {
	const e = entry({ key: 'melanin', eventName: 'Melanin Soul-RnB', venue: 'The Alchemist Kitchen and Bar', zone: 'BUGOLOBI' });
	assert.equal(blockText(e, ''), 'SAT 31 OCT\nMelanin Soul-RnB\nThe Alchemist Kitchen and Bar · Bugolobi\n21:00 · Free · Social');
	assert.equal(blockText({ ...e, perk: 'Half-price cocktails · before 9pm' }, '  The one to start at.  ').split('\n').slice(-2).join('|'), 'Half-price cocktails · before 9pm|The one to start at.');
});

test('zones read as places', () => {
	assert.equal(zoneLabel('KABALAGALA–MUYENGA'), 'Kabalagala–Muyenga');
	assert.equal(zoneLabel('ENTEBBE RD. NORTH'), 'Entebbe Rd. North');
	assert.equal(zoneLabel('CBD'), 'CBD');
});

test('order: by night, then as placed; an unplaced row never jumps a decision', () => {
	const es = [entry({ key: 'sat-a' }), entry({ key: 'fri', date: '2026-10-30' }), entry({ key: 'sat-b' }), entry({ key: 'sat-c' })];
	assert.deepEqual(ordered(es, new Map()).map((e) => e.key), ['fri', 'sat-a', 'sat-b', 'sat-c']);
	const placed = new Map([['sat-c', 1], ['sat-a', 2]]);
	assert.deepEqual(ordered(es, placed).map((e) => e.key), ['fri', 'sat-c', 'sat-a', 'sat-b']);
	assert.deepEqual(nights(ordered(es, placed)).map((n) => [n.date, n.entries.length]), [['2026-10-30', 1], ['2026-10-31', 3]]);
});

test('the TikTok cut proposes one per register, strongest claim first, then your order', () => {
	const es = [
		entry({ key: 'chill-listing', register: 'CHILL' }),
		entry({ key: 'chill-vouch', register: 'CHILL', claimType: 'VETTED' }),
		entry({ key: 'social-1' }),
		entry({ key: 'social-2' }),
		entry({ key: 'loud', register: 'HIGH_ENERGY', claimType: 'TRANSFERRED' })
	];
	assert.deepEqual(proposeTikTok(es), { CHILL: 'chill-vouch', SOCIAL: 'social-1', HIGH_ENERGY: 'loud' });
	assert.deepEqual(proposeTikTok(es.filter((e) => e.register !== 'CHILL')).CHILL, undefined);
});

test('caption: the three locked tags always, then what you kept; blanks dropped', () => {
	const c = captionText('Intro.', 'Chill, Social or High-Energy?', ['#ChillKampala', ' kampala this week ', '', '#']);
	assert.equal(c, `Intro.\n\nChill, Social or High-Energy?\n\n${LOCKED_TAGS.join(' ')} #ChillKampala #kampalathisweek`);
	assert.equal(cleanTag('##Social Kampala'), '#SocialKampala');
});

test('the pointer must name all three moods', () => {
	assert.deepEqual(missingMoods('Chill or social?'), ['HIGH_ENERGY']);
	assert.deepEqual(missingMoods('Chill, Social, High Energy'), []);
});

test('a venue or zone tag in the post’s ten is flagged', () => {
	assert.equal(placeTagClash('#AlchemistKitchenAndBar', ['The Alchemist Kitchen and Bar', 'BUGOLOBI']), null);
	assert.equal(placeTagClash('#Bugolobi', ['The Alchemist Kitchen and Bar', 'BUGOLOBI']), 'BUGOLOBI');
	assert.equal(placeTagClash('#BugolobiNights', ['BUGOLOBI']), 'BUGOLOBI');
	assert.equal(placeTagClash('#KampalaThisWeek', ['BUGOLOBI']), null);
});

test('cover reports the count that cleared', () => {
	assert.equal(coverText(21, '2026-10-26'), '21 nights · Mon 26 Oct – Sun 1 Nov');
});

test('a standing night publishes against its residency; a dated row against itself', () => {
	assert.deepEqual(publicationTarget(entry({ key: 'res|2026-10-31', kind: 'STANDING', residencyId: 'res' })), { residencyId: 'res', occurrenceId: null });
	assert.deepEqual(publicationTarget(entry({ key: 'occ', kind: 'OVERRIDE', residencyId: 'res' })), { occurrenceId: 'occ', residencyId: null });
});

test('Rule F2 gates the TikTok proposal: a doesn’t-clear night is never proposed; a cleared one beats an unjudged vouch', () => {
	const es = [
		entry({ key: 'loud-vouch-failed', register: 'HIGH_ENERGY', claimType: 'VETTED', clearsF2: false }),
		entry({ key: 'loud-listing', register: 'HIGH_ENERGY' }),
		entry({ key: 'social-vouch', claimType: 'VETTED' }),
		entry({ key: 'social-cleared', claimType: 'FACTUAL', clearsF2: true }),
		entry({ key: 'chill-failed', register: 'CHILL', claimType: 'VETTED', clearsF2: false })
	];
	assert.deepEqual(proposeTikTok(es), { HIGH_ENERGY: 'loud-listing', SOCIAL: 'social-cleared' });
});
