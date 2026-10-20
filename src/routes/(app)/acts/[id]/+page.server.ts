import { error, fail } from '@sveltejs/kit';
import { prisma, ActRole } from '#lib/server/prisma.js';
import { Invalid, failureMessage, oneOf, phone, text } from '#lib/server/forms.js';
import { billedNames, loadActs } from '#lib/server/acts.js';
import { asDate, isoDate, kampalaDate } from '#lib/server/register.js';
import { nearMatch, resolveAct } from '#lib/build/acts.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const act = await prisma.act.findUnique({ where: { id: params.id }, include: { organiser: { select: { id: true, name: true } } } });
	if (!act) error(404, 'No such act');
	const answersTo = [act.name, ...act.aliases].map((n) => n.toLowerCase());

	const [organisers, residencies, occurrences, names, acts] = await Promise.all([
		prisma.organiser.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
		prisma.$queryRaw<{ id: string; event: string; venue: string; day: number; lineup: string[] }[]>`
			SELECT r."id", r."eventName" || CASE WHEN r."active" THEN '' ELSE ' (stopped)' END AS event, v."name" AS venue, r."dayOfWeek" AS day, r."lineup"
			FROM "Residency" r JOIN "Venue" v ON v."id" = r."venueId"
			WHERE EXISTS (SELECT 1 FROM unnest(r."lineup") n WHERE lower(btrim(n)) = ANY (${answersTo}::text[]))`,
		prisma.$queryRaw<{ id: string; event: string; venue: string; date: Date; lineup: string[] }[]>`
			SELECT o."id", o."eventName" || CASE WHEN o."status" = 'CANCELLED' THEN ' (cancelled)' ELSE '' END AS event, v."name" AS venue, o."date", o."lineup"
			FROM "Occurrence" o JOIN "Venue" v ON v."id" = o."venueId"
			WHERE EXISTS (SELECT 1 FROM unnest(o."lineup") n WHERE lower(btrim(n)) = ANY (${answersTo}::text[]))
			ORDER BY o."date" DESC`,
		billedNames(),
		loadActs()
	]);

	// Names billed somewhere that no act claims — what "merge into this one" can take. Likely ones first.
	const loose = names.filter((n) => !resolveAct(n, acts));
	const close = loose.filter((n) => nearMatch(n, [act.name, ...act.aliases]));

	return {
		act: {
			id: act.id,
			name: act.name,
			aliases: act.aliases,
			role: act.role,
			transfers: act.transfers,
			transfersNote: act.transfersNote,
			lastSeen: kampalaDate(act.lastSeen),
			organiserId: act.organiserId,
			notes: act.notes,
			contactName: act.contactName,
			phone: act.phone,
			whatsapp: act.whatsapp,
			bestTimeToReach: act.bestTimeToReach,
			phoneVerifiedAt: kampalaDate(act.phoneVerifiedAt),
			lastContacted: kampalaDate(act.lastContacted),
			paidClient: act.paidClient,
			updatedAt: act.updatedAt.toISOString()
		},
		organisers,
		nights: [
			...residencies.map((r) => ({ href: `/residencies/${r.id}`, event: r.event, venue: r.venue, when: `every ${['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][r.day]}`, lineup: r.lineup })),
			...occurrences.map((o) => ({ href: `/occurrences/${o.id}`, event: o.event, venue: o.venue, when: isoDate(o.date), lineup: o.lineup }))
		],
		mergeable: [...close, ...loose.filter((n) => !close.includes(n))]
	};
};

/** Names this act would answer to must not already belong to another act. */
async function assertFree(id: string, candidates: string[]) {
	const lower = candidates.map((c) => c.toLowerCase());
	const clash = await prisma.$queryRaw<{ name: string }[]>`
		SELECT "name" FROM "Act" a WHERE a."id" <> ${id}
		  AND (lower(a."name") = ANY (${lower}::text[]) OR EXISTS (SELECT 1 FROM unnest(a."aliases") x WHERE lower(x) = ANY (${lower}::text[])))`;
	if (clash.length) throw new Invalid(`${clash[0].name} already answers to one of those names.`);
}

export const actions: Actions = {
	save: async ({ params, request }) => {
		const f = await request.formData();
		try {
			const current = await prisma.act.findUnique({ where: { id: params.id } });
			if (!current) throw new Invalid('No such act.');
			const name = text(f, 'name');
			if (!name) throw new Invalid('The act needs its name.');
			const t = text(f, 'transfers');
			const transfers = t === 'yes' ? true : t === 'no' ? false : null;
			const transfersNote = text(f, 'transfersNote');
			if (transfers === true && !transfersNote) throw new Invalid('Say why their own name is the reason to go — a transfers “yes” needs a note.');
			// Renaming keeps the old name as an alias, so lineups billed under it still resolve.
			const aliases = [
				...new Set(
					[...(text(f, 'aliases') ?? '').split(','), ...(current.name !== name ? [current.name] : [])]
						.map((a) => a.trim())
						.filter((a) => a && a.toLowerCase() !== name.toLowerCase())
				)
			];
			await assertFree(params.id, [name, ...aliases]);
			const lastSeen = text(f, 'lastSeen');
			if (lastSeen && !/^\d{4}-\d{2}-\d{2}$/.test(lastSeen)) throw new Invalid('Last seen must be a date.');
			const seen = text(f, 'updatedAt');
			const number = phone(f, 'phone');
			const { count } = await prisma.act.updateMany({
				where: { id: params.id, updatedAt: new Date(seen ?? 0) },
				data: {
					name,
					aliases,
					role: oneOf(ActRole, text(f, 'role'), 'role'),
					transfers,
					transfersNote,
					lastSeen: lastSeen ? asDate(lastSeen) : null,
					organiserId: text(f, 'organiserId'),
					notes: text(f, 'notes'),
					// Contact — internal. A number nobody has answered isn't verified, whatever it replaced.
					contactName: text(f, 'contactName'),
					phone: number,
					...(number !== current.phone && { phoneVerifiedAt: null }),
					whatsapp: f.get('whatsapp') === 'on',
					bestTimeToReach: text(f, 'bestTime'),
					paidClient: f.get('paidClient') === 'on'
				}
			});
			if (count === 0) throw new Invalid('This act changed since you loaded the page — reload to see the latest.');
		} catch (e) {
			const message = failureMessage(e);
			if (message) return fail(400, { error: message });
			console.error(e);
			return fail(500, { error: 'The save failed. Nothing was written.' });
		}
		return { saved: true };
	},

	// Merging moves a name into aliases. No lineup is ever rewritten: the old
	// billing still reads as it was advertised, and now resolves to this act.
	merge: async ({ params, request }) => {
		const f = await request.formData();
		try {
			const name = text(f, 'merge');
			if (!name) throw new Invalid('Pick the name to merge in.');
			const act = await prisma.act.findUnique({ where: { id: params.id } });
			if (!act) throw new Invalid('No such act.');
			await assertFree(params.id, [name]);
			if ([act.name, ...act.aliases].some((a) => a.toLowerCase() === name.toLowerCase())) throw new Invalid(`${act.name} already answers to “${name}”.`);
			await prisma.act.update({ where: { id: params.id }, data: { aliases: [...act.aliases, name] } });
			return { merged: name };
		} catch (e) {
			const message = failureMessage(e);
			if (message) return fail(400, { error: message });
			console.error(e);
			return fail(500, { error: 'The merge failed. Nothing was written.' });
		}
	}
};
