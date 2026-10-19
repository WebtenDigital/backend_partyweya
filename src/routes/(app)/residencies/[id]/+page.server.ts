import { error, fail } from '@sveltejs/kit';
import { prisma, Category, Register } from '#lib/server/prisma.js';
import { Invalid, failureMessage, money, oneOf, text, time } from '#lib/server/forms.js';
import { savePerks } from '#lib/server/perks.js';
import { asDate, kampalaDate } from '#lib/server/register.js';
import { kampalaToday } from '#lib/build/week.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const r = await prisma.residency.findUnique({
		where: { id: params.id },
		include: {
			venue: { select: { id: true, name: true, zoneName: true } },
			organiser: { select: { name: true } },
			perks: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }
		}
	});
	if (!r) error(404, 'No such standing night');
	return {
		today: kampalaToday(),
		residency: {
			id: r.id,
			venue: r.venue,
			organiser: r.organiser?.name ?? null,
			eventName: r.eventName,
			category: r.category,
			dayOfWeek: r.dayOfWeek,
			startTime: r.startTime,
			endTime: r.endTime,
			priceGate: r.priceGate,
			register: r.register,
			lineup: r.lineup,
			runningSince: kampalaDate(r.runningSince)?.slice(0, 7) ?? null,
			active: r.active,
			notes: r.notes,
			claimType: r.claimType,
			source: r.source,
			lastConfirmed: kampalaDate(r.lastConfirmed),
			updatedAt: r.updatedAt.toISOString()
		},
		perks: r.perks.map((p) => ({
			id: p.id,
			kind: p.kind,
			label: p.label,
			condition: p.condition,
			activeUntil: kampalaDate(p.activeUntil)
		}))
	};
};

export const actions: Actions = {
	// Editing the record is not a call: it changes no confirmation, claim or call
	// cadence — only a saved call says the venue confirmed it.
	save: async ({ params, request }) => {
		const f = await request.formData();
		try {
			const eventName = text(f, 'eventName');
			if (!eventName) throw new Invalid('The night needs its name.');
			const category = oneOf(Category, text(f, 'category'), 'category');
			if (!category) throw new Invalid('Pick a category.');
			const register = oneOf(Register, text(f, 'register'), 'register');
			if (!register) throw new Invalid('A standing night needs a register — your best guess until question 6.');
			const day = Number(text(f, 'dayOfWeek'));
			if (!(Number.isInteger(day) && day >= 1 && day <= 7)) throw new Invalid('Which night of the week?');
			const running = text(f, 'runningSince');
			if (running && !/^\d{4}-\d{2}$/.test(running)) throw new Invalid('Running since: a month, like 2025-03.');
			const seen = text(f, 'updatedAt');
			if (!seen) throw new Invalid('Reload the page and try again.');

			await prisma.$transaction(async (tx) => {
				const { count } = await tx.residency.updateMany({
					where: { id: params.id, updatedAt: new Date(seen) },
					data: {
						eventName,
						category,
						dayOfWeek: day,
						startTime: time(f, 'startTime', 'Start'),
						endTime: time(f, 'endTime', 'Wrap'),
						priceGate: money(f, 'priceGate', 'Gate price'),
						register,
						lineup: text(f, 'lineup'),
						runningSince: running ? asDate(`${running}-01`) : null,
						active: f.get('active') === 'on',
						notes: text(f, 'notes')
					}
				});
				if (count === 0) throw new Invalid('This standing night changed since you loaded the page — reload to see the latest.');
				await savePerks(tx, { residencyId: params.id }, f);
			});
		} catch (e) {
			const message = failureMessage(e);
			if (message) return fail(400, { error: message });
			console.error(e);
			return fail(500, { error: 'The save failed. Nothing was written.' });
		}
		return { saved: true };
	}
};
