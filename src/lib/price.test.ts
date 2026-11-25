// node --test src/lib/price.test.ts — no database needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entryRow, floor, priceLabel, type PriceRow } from './price.ts';
import { buildWeek, type ResidencyIn } from './build/week.ts';

const row = (o: Partial<PriceRow> & { amount: number }): PriceRow => ({ label: 'Entry', timing: 'GATE', availableUntil: null, perTable: false, seats: null, ...o });
const sat = '2026-11-14';

test('the floor skips per-table rows — even when a table is the cheapest row on the night', () => {
	const night = [row({ label: 'Single', amount: 100_000 }), row({ label: 'Table', amount: 80_000, perTable: true, seats: 4 })];
	assert.equal(floor(night, sat), 100_000);
	assert.equal(floor([row({ label: 'Table', amount: 500_000, perTable: true })], sat), null); // tables only: no door price
});

test('an early bird counts toward the floor before its deadline, and not after', () => {
	const night = [row({ label: 'Early bird', amount: 80_000, timing: 'ADVANCE', availableUntil: '2026-11-12' }), row({ label: 'Gate', amount: 100_000 })];
	assert.equal(floor(night, '2026-11-10'), 80_000); // asked before
	assert.equal(floor(night, '2026-11-12'), 80_000); // its last day
	assert.equal(floor(night, '2026-11-13'), 100_000); // asked after: nobody can buy it
	assert.equal(priceLabel(night, '2026-11-13').entry, '100K');
});

test('one row at 0 is Free; at 20000 is 20K; several are "from" the lowest', () => {
	assert.equal(priceLabel([row({ amount: 0 })], sat).entry, 'Free');
	assert.equal(priceLabel([row({ amount: 20_000 })], sat).entry, '20K');
	const tiers = [row({ label: 'VVIP', amount: 150_000 }), row({ label: 'Ordinary', amount: 20_000, timing: 'ADVANCE' }), row({ label: 'Ordinary', amount: 30_000 }), row({ label: 'VIP', amount: 50_000 })];
	assert.equal(priceLabel(tiers, sat).entry, 'from 20K');
	// Free entry is free, whatever the VIP pays — not "from Free".
	assert.equal(priceLabel([row({ amount: 0 }), row({ label: 'VIP', amount: 50_000 })], sat).entry, 'Free');
});

test('per-table rows are listed apart, with their seats', () => {
	const night = [
		row({ label: 'Single', amount: 100_000 }),
		row({ label: 'Gold', amount: 5_000_000, perTable: true, seats: 8 }),
		row({ label: 'Silver', amount: 3_000_000, perTable: true, seats: 8 }),
		row({ label: 'VIP table', amount: 500_000, perTable: true })
	];
	const p = priceLabel(night, sat);
	assert.equal(p.entry, '100K');
	assert.deepEqual(p.tables, ['VIP table 500K per table', 'Silver 3M · seats 8', 'Gold 5M · seats 8']);
});

test('no price rows reads NOT ASKED YET — not free', () => {
	const p = priceLabel([], sat);
	assert.deepEqual([p.asked, p.entry], [false, null]);
	const night: ResidencyIn = {
		id: 'quiz', venue: { id: 'v', name: 'V', zone: null, division: null, phone: null }, eventName: 'Quiz', category: 'QUIZ', dayOfWeek: 6,
		startTime: '20:00', prices: [], register: 'SOCIAL', recurrence: 'WEEKLY', claimType: null, source: null, lastConfirmed: '2026-11-10',
		attendedAt: null, attendedBy: null, clearsF2: null, lineup: [], perks: []
	};
	const [r] = buildWeek('2026-11-09', [night], []);
	assert.ok(r.missing.includes('cover'));
	assert.equal(r.price.entry, null);
	const [free] = buildWeek('2026-11-09', [{ ...night, prices: [row({ amount: 0 })] }], []);
	assert.ok(!free.missing.includes('cover'));
	assert.equal(free.price.entry, 'Free');
});

test('the visit checks the entry row: the first per-person gate price', () => {
	const night = [row({ label: 'Table', amount: 50_000, perTable: true }), row({ label: 'Early', amount: 15_000, timing: 'ADVANCE' }), row({ label: 'Entry', amount: 20_000 })];
	assert.equal(entryRow(night)?.label, 'Entry');
	assert.equal(entryRow([row({ label: 'Early', amount: 15_000, timing: 'ADVANCE' })])?.label, 'Early');
});
