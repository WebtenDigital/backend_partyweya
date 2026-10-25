import { fail, redirect } from '@sveltejs/kit';
import { prisma } from '#lib/server/prisma.js';
import { Invalid, failureMessage, text } from '#lib/server/forms.js';
import { asDate, isWeek, isoDate, loadWeek } from '#lib/server/register.js';
import { addDays, kampalaToday, nextMonday } from '#lib/build/week.js';
import { SUGGESTED_TAGS, cleanTag, entryOf, ordered, publicationTarget } from '#lib/build/roundup.js';
import type { Actions, PageServerLoad } from './$types';

// The round-up brief. It reads the register and writes only its own draft
// (Roundup, RoundupEntry) and, on Published, Publication rows. Never an
// Occurrence, a Residency or a Venue: a wrong fact is fixed in the register,
// and this screen re-queries.

/** The week's publishable entries in the decided order, or the checks that failed. */
async function brief(week: string) {
	const { rows, gate } = await loadWeek(week);
	if (!gate.publishable) return { gate, entries: null };
	const draft = await prisma.roundup.findUnique({ where: { week: asDate(week) }, include: { entries: true } });
	const positions = new Map(draft?.entries.map((e) => [e.key, e.position]) ?? []);
	const entries = ordered(rows.filter((r) => r.state === 'publishable').map(entryOf), positions);
	return { gate, entries, draft };
}

export const load: PageServerLoad = async ({ url }) => {
	const week = url.searchParams.get('week');
	if (!isWeek(week)) redirect(307, `/build/roundup?week=${nextMonday(kampalaToday())}`);

	const { gate, entries, draft } = await brief(week);
	// The gate is not advisory: a failing week shows what failed, and nothing else.
	if (!entries) return { week, blocked: true as const, failed: gate.checks.filter((c) => c.pass === false), gate: { passed: gate.passed, total: gate.total } };

	// How often each entry has already travelled in a round-up.
	const pubs = await prisma.publication.findMany({
		where: { postType: 'ROUND_UP', nightDate: { gte: asDate(week), lte: asDate(addDays(week, 6)) } },
		select: { occurrenceId: true, residencyId: true, nightDate: true, postedAt: true },
		orderBy: { postedAt: 'asc' }
	});
	const keyOf = (p: (typeof pubs)[number]) => p.occurrenceId ?? `${p.residencyId}|${isoDate(p.nightDate)}`;
	const times = new Map<string, number>();
	for (const p of pubs) times.set(keyOf(p), (times.get(keyOf(p)) ?? 0) + 1);
	const posts = [...new Set(pubs.map((p) => p.postedAt.toISOString()))];

	const lines = new Map(draft?.entries.map((e) => [e.key, e.line]) ?? []);
	return {
		week,
		blocked: false as const,
		today: kampalaToday(),
		entries: entries.map((e) => ({ ...e, line: lines.get(e.key) ?? '', published: times.get(e.key) ?? 0 })),
		intro: draft?.intro ?? '',
		pointer: draft?.pointer ?? '',
		tags: draft?.tags.length ? draft.tags : SUGGESTED_TAGS,
		tiktok: draft?.tiktok ?? [],
		// The post itself, by when it was marked published.
		published: posts
	};
};

const failed = (e: unknown) => {
	const message = failureMessage(e);
	if (message) return fail(400, { error: message });
	console.error(e);
	return fail(500, { error: 'The save failed. Nothing was written.' });
};

/**
 * The draft for a week, created on the first thing saved, with every entry
 * holding its place as shown. An entry that became publishable since is
 * placed after the decided ones, so saving a line never reorders anything.
 */
async function draftFor(week: string, entries: { key: string }[]) {
	await prisma.roundup.upsert({ where: { week: asDate(week) }, create: { week: asDate(week) }, update: {} });
	await prisma.roundupEntry.createMany({
		data: entries.map((e, i) => ({ week: asDate(week), key: e.key, position: 1_000_000 + i })),
		skipDuplicates: true
	});
}

async function openWeek(f: FormData) {
	const week = text(f, 'week');
	if (!isWeek(week)) throw new Invalid('Which week? Reload the page.');
	const { entries } = await brief(week);
	if (!entries) throw new Invalid('This week’s gate no longer passes — go back to the Sunday Build.');
	await draftFor(week, entries);
	return { week, keys: new Set(entries.map((e) => e.key)), entries };
}

export const actions: Actions = {
	// The line typed for one entry. Only ever what was typed.
	line: async ({ request }) => {
		try {
			const f = await request.formData();
			const { week, keys } = await openWeek(f);
			const key = text(f, 'key');
			if (!key || !keys.has(key)) throw new Invalid('That entry is no longer in this week’s set — reload.');
			await prisma.roundupEntry.update({ where: { week_key: { week: asDate(week), key } }, data: { line: String(f.get('line') ?? '') } });
			return { saved: key };
		} catch (e) {
			return failed(e);
		}
	},

	// The whole set's order, as decided. Every key gets its slide number.
	order: async ({ request }) => {
		try {
			const f = await request.formData();
			const { week, keys } = await openWeek(f);
			const order = f.getAll('key').map(String).filter((k) => keys.has(k));
			await prisma.$transaction(
				order.map((key, i) => prisma.roundupEntry.update({ where: { week_key: { week: asDate(week), key } }, data: { position: i + 1 } }))
			);
			return { ordered: order.length };
		} catch (e) {
			return failed(e);
		}
	},

	// Intro, the Rule F6 pointer and the seven editable tag slots. The three
	// locked tags are not a field: there is nothing to post that could change them.
	caption: async ({ request }) => {
		try {
			const f = await request.formData();
			const { week } = await openWeek(f);
			const tags = f.getAll('tag').map((t) => cleanTag(String(t))).slice(0, 7);
			while (tags.length < 7) tags.push('');
			await prisma.roundup.upsert({
				where: { week: asDate(week) },
				create: { week: asDate(week), intro: String(f.get('intro') ?? ''), pointer: String(f.get('pointer') ?? ''), tags },
				update: { intro: String(f.get('intro') ?? ''), pointer: String(f.get('pointer') ?? ''), tags }
			});
			return { saved: 'caption' };
		} catch (e) {
			return failed(e);
		}
	},

	// The TikTok cut, as confirmed or changed.
	tiktok: async ({ request }) => {
		try {
			const f = await request.formData();
			const { week, keys } = await openWeek(f);
			const tiktok = f.getAll('key').map(String).filter((k) => keys.has(k));
			await prisma.roundup.upsert({ where: { week: asDate(week) }, create: { week: asDate(week), tiktok }, update: { tiktok } });
			return { saved: 'tiktok' };
		} catch (e) {
			return failed(e);
		}
	},

	// Taken after the post is actually up — never by building it. One Publication
	// row per entry, in slide order, carrying the line as written. Pressing it
	// again records a second appearance: each row is a time the entry travelled.
	published: async ({ request }) => {
		try {
			const f = await request.formData();
			const { week, entries } = await openWeek(f);
			const draft = await prisma.roundup.findUnique({ where: { week: asDate(week) }, include: { entries: true } });
			const lines = new Map(draft?.entries.map((e) => [e.key, e.line.trim()]) ?? []);
			const postedAt = new Date();
			await prisma.publication.createMany({
				data: entries.map((e, i) => ({
					...publicationTarget(e),
					nightDate: asDate(e.date),
					postType: 'ROUND_UP' as const,
					platform: 'instagram',
					postedAt,
					position: i + 1,
					line: lines.get(e.key) || null
				}))
			});
			return { published: entries.length };
		} catch (e) {
			return failed(e);
		}
	}
};
