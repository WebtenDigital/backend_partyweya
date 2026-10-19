// Import the register sheet exports (Venue, Residency, Occurrence CSVs) into
// the database. Idempotent: rows are upserted by id, so re-running after a
// sheet fix updates in place. Runs in one transaction — all or nothing.
//
//   node scripts/import-register.mjs [dir]     (default: ./data)
//
// Expects files named "… · Venue.csv", "… · Residency.csv", "… · Occurrence.csv".

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const dir = process.argv[2] ?? 'data';

function parseCsv(text) {
	const rows = [];
	let row = [],
		field = '',
		quoted = false;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (quoted) {
			if (ch !== '"') field += ch;
			else if (text[i + 1] === '"') (field += '"'), i++;
			else quoted = false;
		} else if (ch === '"') quoted = true;
		else if (ch === ',') row.push(field), (field = '');
		else if (ch === '\n' || ch === '\r') {
			if (ch === '\r' && text[i + 1] === '\n') i++;
			row.push(field), rows.push(row), (row = []), (field = '');
		} else field += ch;
	}
	if (field || row.length) row.push(field), rows.push(row);
	const [header, ...body] = rows.filter((r) => r.some((x) => x.trim() !== ''));
	return body.map((r) =>
		Object.fromEntries(header.map((k, i) => [k.trim(), (r[i] ?? '').trim() || null]))
	);
}

function load(sheet) {
	const file = fs.readdirSync(dir).find((f) => f.endsWith(`· ${sheet}.csv`));
	if (!file) throw new Error(`No "· ${sheet}.csv" in ${dir}`);
	return parseCsv(fs.readFileSync(path.join(dir, file), 'utf8'));
}

const int = (v) => (v == null ? null : Number.parseInt(v, 10));
const bool = (v, fallback) => (v == null ? fallback : v.toUpperCase() === 'TRUE');
const join = (...parts) => parts.filter(Boolean).join('; ') || null;
// "Ice Prince;" → "Ice Prince"
const trimList = (v) => v?.replace(/[;\s]+$/, '') || null;

const venues = load('Venue').map((v) => ({
	id: v.id,
	name: v.name,
	location: v.location,
	areas: JSON.parse(v.areas ?? '[]'),
	zone: v.zone,
	division: v.division,
	contactName: v.contactName,
	contactRole: v.contactRole,
	phone: v.phone,
	conversationTest: v.conversationTest,
	provisionalRegister: v.provisionalRegister,
	paidClient: bool(v.paidClient, false),
	notes: join(v.notes, v.check)
}));

const residencies = load('Residency').map((r) => ({
	id: r.id,
	venueId: r.venueId,
	eventName: r.eventName,
	category: r.category,
	dayOfWeek: int(r.dayOfWeek),
	startTime: r.startTime,
	endTime: r.endTime,
	priceGate: int(r.priceGate),
	register: r.register,
	runningSince: r.runningSince,
	active: bool(r.active, true),
	notes: trimList(r.notes)
}));

const occurrences = load('Occurrence').map((o) => ({
	id: o.id,
	date: o.date,
	venueId: o.venueId,
	residencyId: o.residencyId,
	eventName: o.eventName,
	category: o.category,
	startTime: o.startTime,
	endTime: o.endTime,
	priceGate: int(o.priceGate),
	priceAdvance: int(o.priceAdvance),
	priceNote: o.priceNote,
	lineup: trimList(o.lineup),
	register: o.register,
	claimType: o.claimType,
	source: o.source,
	status: o.status ?? 'LEAD',
	confirmedOn: o.confirmedOn,
	confirmedBy: o.confirmedBy
}));

// The sheet carries zone + division on every venue; derive the zone map from
// it, refusing a zone that appears under two divisions.
const zones = new Map();
for (const v of venues) {
	if (!v.zone) continue;
	if (zones.has(v.zone) && zones.get(v.zone) !== v.division)
		throw new Error(`Zone ${v.zone} is in both ${zones.get(v.zone)} and ${v.division}`);
	zones.set(v.zone, v.division);
}

// Postgres types for columns that need a cast from text parameters.
const casts = {
	contactRole: '"ContactRole"',
	conversationTest: '"ConversationTest"',
	provisionalRegister: '"Register"',
	register: '"Register"',
	category: '"Category"',
	claimType: '"ClaimType"',
	status: '"OccurrenceStatus"',
	date: 'date',
	runningSince: 'timestamp',
	confirmedOn: 'timestamp',
	areas: 'text[]'
};

async function upsert(client, table, key, rows) {
	for (const row of rows) {
		const cols = Object.keys(row);
		const values = cols.map((c, i) => `$${i + 1}${casts[c] ? `::${casts[c]}` : ''}`);
		const updates = cols.filter((c) => c !== key).map((c) => `"${c}" = excluded."${c}"`);
		if (table !== 'Zone') updates.push('"updatedAt" = now()');
		await client.query(
			`insert into "${table}" (${cols.map((c) => `"${c}"`).join(', ')})
			 values (${values.join(', ')})
			 on conflict ("${key}") do update set ${updates.join(', ')}`,
			cols.map((c) => row[c])
		);
	}
	console.log(`${table}: ${rows.length}`);
}

const client = new pg.Client({ connectionString: process.env.DIRECT_URL });
await client.connect();
try {
	await client.query('begin');
	await upsert(client, 'Zone', 'name', [...zones].map(([name, division]) => ({ name, division })));
	await upsert(client, 'Venue', 'id', venues);
	await upsert(client, 'Residency', 'id', residencies);
	await upsert(client, 'Occurrence', 'id', occurrences);
	await client.query('commit');
} catch (e) {
	await client.query('rollback');
	throw e;
} finally {
	await client.end();
}
