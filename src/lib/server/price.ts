// Price rows from a form, and saving them. The pure half — the floor and the
// published label — is lib/price.ts, re-exported here so server code has one
// place to import prices from.
//
// The editor (PricesEditor) posts parallel lists — price_id, price_label,
// price_amount, price_timing, price_until, price_table, price_seats — plus
// `prices_sent`, so a form without it never touches prices, and `price_count`
// so several editors on one form (the night blocks) can be sliced apart.

import { PriceTiming } from './prisma.js';
import { Invalid, oneOf } from './forms.js';
import type { Tx } from './db.js';
import type { PriceRow } from '../price.js';

export { entryRow, floor, priceLabel, shillings, type PriceLabel, type PriceRow } from '../price.js';

type Parent = { residencyId: string } | { occurrenceId: string };
export type ParsedPrice = NonNullable<ReturnType<typeof parsePrices>>[number];

/** "20000", "20,000", "20K", "1.5M" → shillings. */
function amountOf(v: string, label: string) {
	const m = v.replace(/[,\s]/g, '').match(/^(\d+(?:\.\d+)?)([kKmM]?)$/);
	const n = m ? Math.round(Number(m[1]) * (m[2] ? (/k/i.test(m[2]) ? 1_000 : 1_000_000) : 1)) : NaN;
	if (!Number.isInteger(n) || n < 0) throw new Invalid(`“${label}”: the price must be shillings — 20000, or 20K.`);
	return n;
}

export function parsePrices(f: FormData, prefix = 'price', rows?: { from: number; count: number }) {
	if (!rows && !f.has(`${prefix}s_sent`)) return null;
	const list = (k: string) => {
		const all = f.getAll(`${prefix}_${k}`).map((v) => (typeof v === 'string' ? v.trim() : ''));
		return rows ? all.slice(rows.from, rows.from + rows.count) : all;
	};
	const [ids, labels, amounts, timings, untils, tables, seats] = ['id', 'label', 'amount', 'timing', 'until', 'table', 'seats'].map(list);
	return amounts
		.map((amount, i) => ({ i, amount, label: labels[i] ?? '' }))
		.filter((p) => p.amount) // a row with no amount is an unused line, whatever its label says
		.map(({ i, amount, label }, sortOrder) => {
			const name = label || 'Entry';
			const perTable = tables[i] === '1';
			const until = untils[i] || null;
			if (until && !/^\d{4}-\d{2}-\d{2}$/.test(until)) throw new Invalid(`“${name}”: the on-sale date must be a date.`);
			const n = seats[i] ? Number(seats[i]) : null;
			if (n != null && !(Number.isInteger(n) && n > 0)) throw new Invalid(`“${name}”: seats must be a whole number.`);
			return {
				id: ids[i] || null,
				label: name,
				amount: amountOf(amount, name),
				timing: oneOf(PriceTiming, timings[i] || null, 'price timing'),
				availableUntil: until,
				perTable,
				seats: perTable ? n : null, // a capacity only means something for a table
				sortOrder
			};
		});
}

/** The submitted list replaces the night's prices: kept rows updated, new ones created, missing ones deleted. */
export async function savePrices(tx: Tx, parent: Parent, prices: ParsedPrice[] | null) {
	if (prices === null) return;
	const keep = prices.map((p) => p.id).filter((id): id is string => !!id);
	await tx.price.deleteMany({ where: { ...parent, id: { notIn: keep } } });
	for (const { id, availableUntil, ...p } of prices) {
		const data = { ...p, availableUntil: availableUntil ? new Date(`${availableUntil}T00:00:00Z`) : null }; // a @db.Date
		if (id) {
			const { count } = await tx.price.updateMany({ where: { id, ...parent }, data });
			if (count === 0) throw new Invalid('A price changed since you loaded the page — reload and try again.');
		} else await tx.price.create({ data: { ...parent, ...data } });
	}
}

/** A Price row from the database, as the pure functions and the editor take it. */
export const priceRow = (p: { id: string; label: string; amount: number; timing: string | null; availableUntil: Date | null; perTable: boolean; seats: number | null; sortOrder: number }) => ({
	id: p.id,
	label: p.label,
	amount: p.amount,
	timing: p.timing as PriceRow['timing'],
	availableUntil: p.availableUntil ? p.availableUntil.toISOString().slice(0, 10) : null,
	perTable: p.perTable,
	seats: p.seats,
	sortOrder: p.sortOrder
});

export const PRICE_ORDER = [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }];
