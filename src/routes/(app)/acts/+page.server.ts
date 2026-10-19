import { fail, redirect } from '@sveltejs/kit';
import { prisma, ActRole } from '#lib/server/prisma.js';
import { Invalid, failureMessage, oneOf, slug, text } from '#lib/server/forms.js';
import { billingKey, billings } from '#lib/server/acts.js';
import { kampalaDate } from '#lib/server/register.js';
import { resolveAct, type ActRef } from '#lib/build/acts.js';
import type { Actions, PageServerLoad } from './$types';

type Use = { name: string; night: string; venue: string; event: string };

export const load: PageServerLoad = async ({ url }) => {
	const [acts, uses, lineups] = await Promise.all([
		prisma.act.findMany({ orderBy: { name: 'asc' } }),
		// Every billed name with the night it's on: live standing nights and dated rows that aren't cancelled.
		prisma.$queryRaw<Use[]>`
			SELECT btrim(n) AS name, 'r:' || r."id" AS night, v."name" AS venue, r."eventName" AS event
			FROM "Residency" r JOIN "Venue" v ON v."id" = r."venueId", unnest(r."lineup") n
			WHERE r."active" AND btrim(n) <> ''
			UNION ALL
			SELECT btrim(n), 'o:' || o."id", v."name", o."eventName"
			FROM "Occurrence" o JOIN "Venue" v ON v."id" = o."venueId", unnest(o."lineup") n
			WHERE o."status" <> 'CANCELLED' AND btrim(n) <> ''`,
		prisma.$queryRaw<{ lineup: string[] }[]>`
			SELECT DISTINCT "lineup" FROM (SELECT "lineup" FROM "Residency" UNION ALL SELECT "lineup" FROM "Occurrence") x
			WHERE cardinality("lineup") > 1`
	]);

	const refs: ActRef[] = acts.map((a) => ({ id: a.id, name: a.name, aliases: a.aliases, role: a.role, transfers: a.transfers }));

	// One entry per act, or per unclassified name.
	type Entry = {
		key: string;
		name: string;
		act: { id: string; role: string | null; transfers: boolean | null; lastSeen: string | null; aliases: string[] } | null;
		billedAs: Set<string>;
		nights: Set<string>;
		venues: Map<string, Set<string>>;
	};
	const entries = new Map<string, Entry>();
	const entryFor = (billed: string) => {
		const act = resolveAct(billed, refs);
		const key = act ? `act:${act.id}` : `name:${billed.toLowerCase()}`;
		if (!entries.has(key)) {
			const full = act ? acts.find((a) => a.id === act.id)! : null;
			entries.set(key, {
				key,
				name: full?.name ?? billed,
				act: full
					? { id: full.id, role: full.role, transfers: full.transfers, lastSeen: kampalaDate(full.lastSeen), aliases: full.aliases }
					: null,
				billedAs: new Set(),
				nights: new Set(),
				venues: new Map()
			});
		}
		return entries.get(key)!;
	};
	for (const a of acts) entryFor(a.name);
	for (const u of uses) {
		const e = entryFor(u.name);
		e.billedAs.add(u.name);
		e.nights.add(u.night);
		if (!e.venues.has(u.venue)) e.venues.set(u.venue, new Set());
		e.venues.get(u.venue)!.add(u.event);
	}

	// Real lineups, composed by the one billing function — the roles at work.
	const multi = lineups.map((l) => l.lineup).slice(0, 12);
	const lines = await billings(multi);
	const examples = multi
		.map((l) => ({ lineup: l, billing: lines.get(billingKey(l)) ?? l.join(', ') }))
		.filter((x) => x.billing !== x.lineup.join(', ') || x.lineup.length > 2)
		.slice(0, 4);

	return {
		entries: [...entries.values()]
			.map((e) => ({
				key: e.key,
				name: e.name,
				act: e.act,
				billedAs: [...e.billedAs].filter((b) => b !== e.name),
				nights: e.nights.size,
				venues: [...e.venues].map(([venue, events]) => ({ venue, events: [...events] }))
			}))
			.sort((a, b) => a.name.localeCompare(b.name)),
		examples,
		classify: url.searchParams.get('classify')
	};
};

export const actions: Actions = {
	// Classifying a name is creating its Act — the only place an Act is made by hand.
	classify: async ({ request }) => {
		const f = await request.formData();
		let id: string;
		try {
			const billed = text(f, 'billed');
			const name = text(f, 'name') ?? billed;
			if (!name) throw new Invalid('The act needs its name, as it bills itself.');
			const role = oneOf(ActRole, text(f, 'role'), 'role');
			const aliases = [
				...new Set(
					[billed, ...(text(f, 'aliases') ?? '').split(',')]
						.map((a) => a?.trim())
						.filter((a): a is string => !!a && a.toLowerCase() !== name.toLowerCase())
				)
			];
			const taken = await prisma.$queryRaw<{ name: string }[]>`
				SELECT "name" FROM "Act" a
				WHERE lower(a."name") = ANY (${[name, ...aliases].map((x) => x.toLowerCase())}::text[])
				   OR EXISTS (SELECT 1 FROM unnest(a."aliases") x WHERE lower(x) = ANY (${[name, ...aliases].map((x) => x.toLowerCase())}::text[]))`;
			if (taken.length) throw new Invalid(`${taken[0].name} already answers to that name — merge into it from its record instead.`);
			id = slug(name) || `act-${Date.now().toString(36)}`;
			if (await prisma.act.findUnique({ where: { id } })) id = `${id}-${Date.now().toString(36)}`;
			await prisma.act.create({ data: { id, name, role, aliases } });
		} catch (e) {
			const message = failureMessage(e);
			if (message) return fail(400, { error: message, billed: text(f, 'billed') });
			console.error(e);
			return fail(500, { error: 'The save failed. Nothing was written.', billed: text(f, 'billed') });
		}
		redirect(303, `/acts#act-${id}`);
	}
};
