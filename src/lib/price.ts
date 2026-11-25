// What a night costs, as published. A night's prices are rows (the Price
// table): the venue's own label, an amount, maybe a timing, maybe an on-sale
// deadline, maybe per table. The published figure is DERIVED here, as of a
// date, and stored nowhere — every reader (the week, /build, the round-up,
// the call queue) calls this, so no two screens can disagree about it.
//
// Pure, and outside lib/server on purpose: the week module that calls it is
// loaded in the browser too. lib/server/price.ts re-exports it beside the
// parsing and saving.

/** UGX, the way the register writes it: Free, 900, 20K, 1.5M. */
export function shillings(n: number | null) {
	if (n == null) return '—';
	if (n === 0) return 'Free';
	if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${+(n / 1_000).toFixed(1)}K`;
	return String(n);
}

export interface PriceRow {
	label: string; //                  the venue's word: "Entry", "VIP", "BD Squad"
	amount: number; //                 UGX; 0 = free
	timing: 'GATE' | 'ADVANCE' | null;
	availableUntil: string | null; //  YYYY-MM-DD, the last day on sale
	perTable: boolean; //              per table, not per person
	seats: number | null; //           a table's capacity
	sortOrder?: number;
}

/** Still on sale on `asOf`: an early bird past its deadline is a price nobody can buy. */
const onSale = (p: PriceRow, asOf: string) => p.availableUntil == null || p.availableUntil >= asOf;

/**
 * The floor: the cheapest per-person price on sale on `asOf`, or null when
 * there is none. Per-table rows never count — "table 500K" is a different
 * unit, and as a door price it would be a lie. `asOf` is required: a Sunday
 * Build for next Saturday asks about next Saturday, not about today.
 */
export function floor(rows: PriceRow[], asOf: string): number | null {
	const amounts = rows.filter((p) => !p.perTable && onSale(p, asOf)).map((p) => p.amount);
	return amounts.length ? Math.min(...amounts) : null;
}

export interface PriceLabel {
	asked: boolean; //         any price on file at all — none reads NOT ASKED YET, never free
	entry: string | null; //   "Free", "20K", "from 20K"; null when no per-person price is on sale
	tables: string[]; //       per-table rows, listed apart: "VIP table 500K · seats 8"
}

/** The published figure for a night on `asOf`, and its tables, separately. */
export function priceLabel(rows: PriceRow[], asOf: string): PriceLabel {
	const low = floor(rows, asOf);
	const tiers = new Set(rows.filter((p) => !p.perTable && onSale(p, asOf)).map((p) => p.amount));
	return {
		asked: rows.length > 0,
		// Free entry is free, whatever a VIP pays; otherwise several prices are "from" the lowest.
		entry: low == null ? null : low === 0 || tiers.size === 1 ? shillings(low) : `from ${shillings(low)}`,
		tables: rows
			.filter((p) => p.perTable && onSale(p, asOf))
			.sort((a, b) => a.amount - b.amount)
			.map((p) => `${p.label} ${shillings(p.amount)}${p.seats ? ` · seats ${p.seats}` : ' per table'}`)
	};
}

/**
 * The row a visit's "what did you pay at the gate" checks and corrects: the
 * first per-person gate price, else the first per-person price at all.
 */
export const entryRow = <T extends Pick<PriceRow, 'perTable' | 'timing'>>(rows: T[]): T | undefined =>
	rows.find((p) => !p.perTable && p.timing === 'GATE') ?? rows.find((p) => !p.perTable);
