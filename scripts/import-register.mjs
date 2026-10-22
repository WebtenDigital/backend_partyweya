// Import the register sheet exports into the database, in dependency order:
// Zone → Organiser → Venue → Residency → Occurrence. Idempotent: rows are
// upserted by id, so re-running after a sheet fix updates in place. Runs in
// one transaction — all or nothing.
//
//   node scripts/import-register.mjs [dir]     (default: ./data)
//
// Expects 0_zone.csv, 1_venue.csv, 2_residency.csv, 3_occurrence.csv, and
// optionally organiser.csv. Empty cells are NULL; `areas` is a Postgres
// array literal ({"Bukoto","Kisaasi"}).

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { claimFor } from '../src/lib/provenance.ts';

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

function load(file, { optional = false } = {}) {
	const full = path.join(dir, file);
	if (!fs.existsSync(full)) {
		if (optional) return [];
		throw new Error(`Missing ${full}`);
	}
	return parseCsv(fs.readFileSync(full, 'utf8'));
}

const int = (v) => (v == null ? null : Number.parseInt(v, 10));
const bool = (v, fallback) => (v == null ? fallback : v.toUpperCase() === 'TRUE');
// "Ice Prince;" → "Ice Prince"
const trimList = (v) => v?.replace(/[;\s]+$/, '') || null;
// A billed lineup as names, in order: "D Maestroz Band featuring Iryn Namubiru; Felicia"
// → ['D Maestroz Band', 'Iryn Namubiru', 'Felicia'] — the same split as the acts migration.
const names = (v) =>
	(v ?? '').split(/\s*(?:;|,|\s+featuring\s+|\s+feat\.?\s+|\s+ft\.?\s+)\s*/i).map((n) => n.trim()).filter(Boolean);

// The sheet's free-text sources onto the Source enum (same table as the
// source_enum migration). Enum values pass through; anything else stops
// the import rather than being guessed.
const SOURCES = ['ATTENDED', 'OWNER', 'MANAGER', 'PROMOTER', 'AGENT', 'ACT', 'TICKETING', 'SOCIAL_MEDIA', 'FLYER', 'PRESS', 'AUDIENCE'];
function source(v, where) {
	if (v == null || SOURCES.includes(v)) return v;
	const s = v.toLowerCase();
	if (['attended', 'partyweya', 'went'].includes(s)) return 'ATTENDED';
	if (s === 'owner') return 'OWNER';
	if (s === 'manager') return 'MANAGER';
	if (s.startsWith('promoter')) return 'PROMOTER';
	if (s.startsWith('agent')) return 'AGENT';
	if (s === 'act' || s.startsWith('act ') || s === 'artist' || s === 'performer') return 'ACT';
	if (['quicket', 'mticket', 'ticketing'].includes(s)) return 'TICKETING';
	if (s === 'social media') return 'SOCIAL_MEDIA';
	if (['flyer', 'poster'].includes(s)) return 'FLYER';
	if (s === 'press') return 'PRESS';
	if (s.startsWith('audience')) return 'AUDIENCE';
	throw new Error(`${where}: unknown source "${v}"`);
}

const zones = load('0_zone.csv').map((z) => ({
	name: z.name,
	division: z.division,
	active: bool(z.active, true),
	sortOrder: int(z.sortOrder)
}));

const organisers = load('organiser.csv', { optional: true }).map((o) => ({
	id: o.id,
	name: o.name,
	contactName: o.contactName,
	role: o.role,
	phone: o.phone,
	whatsapp: bool(o.whatsapp, false),
	paidClient: bool(o.paidClient, false),
	notes: o.notes
}));

const venues = load('1_venue.csv').map((v) => ({
	id: v.id,
	name: v.name,
	location: v.location,
	areas: v.areas ?? '{}',
	zoneName: v.zoneName,
	contactName: v.contactName,
	contactRole: v.contactRole,
	// A venue can have several numbers; the sheet's one cell may hold "a / b".
	phones: (v.phone ?? '').split(/[/,]/).map((n) => n.trim()).filter(Boolean),
	conversationTest: v.conversationTest,
	provisionalRegister: v.provisionalRegister,
	paidClient: bool(v.paidClient, false),
	notes: v.notes
}));

const residencies = load('2_residency.csv').map((r) => ({
	id: r.id,
	venueId: r.venueId,
	organiserId: r.organiserId,
	eventName: r.eventName,
	category: r.category,
	dayOfWeek: int(r.dayOfWeek),
	startTime: r.startTime,
	endTime: r.endTime,
	priceGate: int(r.priceGate),
	register: r.register,
	runningSince: r.runningSince,
	active: bool(r.active, true),
	notes: trimList(r.notes),
	...('lineup' in r && { lineup: names(r.lineup) }),
	// Confirmation fields only when the sheet carries them, so a re-import
	// from an older export doesn't wipe confirmations recorded in the app.
	...('lastConfirmed' in r && { lastConfirmed: r.lastConfirmed }),
	// No claimType: the sheet's is ignored and the claim derived below, as on every write.
	...('source' in r && { source: source(r.source, `Residency ${r.id}`) })
}));

const occurrences = load('3_occurrence.csv').map((o) => ({
	id: o.id,
	date: o.date,
	venueId: o.venueId,
	residencyId: o.residencyId,
	organiserId: o.organiserId,
	eventName: o.eventName,
	category: o.category,
	startTime: o.startTime,
	endTime: o.endTime,
	priceGate: int(o.priceGate),
	priceAdvance: int(o.priceAdvance),
	priceNote: o.priceNote,
	lineup: names(o.lineup),
	register: o.register,
	source: source(o.source, `Occurrence ${o.id}`),
	status: o.status ?? 'LEAD',
	confirmedOn: o.confirmedOn,
	confirmedBy: o.confirmedBy
}));

// A blank id must fail the import, not become a row nobody can find.
for (const [table, rows, key] of [
	['Zone', zones, 'name'],
	['Organiser', organisers, 'id'],
	['Venue', venues, 'id'],
	['Residency', residencies, 'id'],
	['Occurrence', occurrences, 'id']
]) {
	const blank = rows.findIndex((r) => !r[key]);
	if (blank !== -1) throw new Error(`${table} row ${blank + 2} has no ${key}`);
}

// Postgres types for columns that need a cast from text parameters.
const casts = {
	contactRole: '"ContactRole"',
	role: '"ContactRole"',
	conversationTest: '"ConversationTest"',
	provisionalRegister: '"Register"',
	register: '"Register"',
	category: '"Category"',
	claimType: '"ClaimType"',
	source: '"Source"',
	status: '"OccurrenceStatus"',
	date: 'date',
	runningSince: 'timestamp',
	confirmedOn: 'timestamp',
	lastConfirmed: 'timestamp',
	areas: 'text[]',
	phones: 'text[]',
	lineup: 'text[]'
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

// The claim is never imported. claimFor() derives it from the stored source and
// the lineup the row bills — an empty dated lineup shows its standing night's —
// resolved by act_for(), the resolver the TRANSFERRED trigger uses.
async function deriveClaims(client, residencyIds, occurrenceIds) {
	const { rows } = await client.query(
		`select 'Residency' t, r."id", r."source", r."claimType",
		        exists (select 1 from unnest(r."lineup") n where (act_for(n))."transfers") transfers
		   from "Residency" r where r."id" = any($1)
		 union all
		 select 'Occurrence', o."id", o."source", o."claimType",
		        exists (select 1 from unnest(case when cardinality(o."lineup") > 0 then o."lineup" else coalesce(s."lineup", '{}') end) n
		                 where (act_for(n))."transfers")
		   from "Occurrence" o left join "Residency" s on s."id" = o."residencyId" where o."id" = any($2)`,
		[residencyIds, occurrenceIds]
	);
	let changed = 0;
	for (const r of rows) {
		const claim = claimFor(r.source, r.transfers);
		if (claim === r.claimType) continue;
		await client.query(`update "${r.t}" set "claimType" = $1::"ClaimType" where "id" = $2`, [claim, r.id]);
		changed++;
	}
	console.log(`Claims derived: ${rows.length} rows, ${changed} changed`);
}

const client = new pg.Client({ connectionString: process.env.DIRECT_URL });
await client.connect();
try {
	await client.query('begin');
	await upsert(client, 'Zone', 'name', zones);
	await upsert(client, 'Organiser', 'id', organisers);
	await upsert(client, 'Venue', 'id', venues);
	await upsert(client, 'Residency', 'id', residencies);
	await upsert(client, 'Occurrence', 'id', occurrences);
	await deriveClaims(client, residencies.map((r) => r.id), occurrences.map((o) => o.id));
	await client.query('commit');
} catch (e) {
	await client.query('rollback');
	throw e;
} finally {
	await client.end();
}
