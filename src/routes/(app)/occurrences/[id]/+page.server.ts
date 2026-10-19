import { error, fail } from '@sveltejs/kit';
import { prisma, Category, Register } from '#lib/server/prisma.js';
import { Invalid, failureMessage, money, oneOf, text, time } from '#lib/server/forms.js';
import { savePerks } from '#lib/server/perks.js';
import { isoDate, kampalaDate } from '#lib/server/register.js';
import { kampalaToday } from '#lib/build/week.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const o = await prisma.occurrence.findUnique({
		where: { id: params.id },
		include: {
			venue: { select: { id: true, name: true } },
			residency: { select: { id: true, eventName: true, lineup: true, perks: { select: { id: true } } } },
			perks: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }
		}
	});
	if (!o) error(404, 'No such dated night');
	return {
		today: kampalaToday(),
		occurrence: {
			id: o.id,
			date: isoDate(o.date),
			venue: o.venue,
			residency: o.residency ? { id: o.residency.id, eventName: o.residency.eventName, lineup: o.residency.lineup, perkCount: o.residency.perks.length } : null,
			eventName: o.eventName,
			category: o.category,
			startTime: o.startTime,
			endTime: o.endTime,
			priceGate: o.priceGate,
			priceAdvance: o.priceAdvance,
			priceNote: o.priceNote,
			lineup: o.lineup,
			register: o.register,
			status: o.status,
			claimType: o.claimType,
			source: o.source,
			confirmedOn: kampalaDate(o.confirmedOn),
			confirmedBy: o.confirmedBy,
			updatedAt: o.updatedAt.toISOString()
		},
		perks: o.perks.map((p) => ({ id: p.id, kind: p.kind, label: p.label, condition: p.condition, activeUntil: kampalaDate(p.activeUntil) }))
	};
};

export const actions: Actions = {
	// The record, not a call: status, claim and confirmation stay as they are.
	save: async ({ params, request }) => {
		const f = await request.formData();
		try {
			const eventName = text(f, 'eventName');
			if (!eventName) throw new Invalid('The night needs its name.');
			const seen = text(f, 'updatedAt');
			if (!seen) throw new Invalid('Reload the page and try again.');
			await prisma.$transaction(async (tx) => {
				const { count } = await tx.occurrence.updateMany({
					where: { id: params.id, updatedAt: new Date(seen) },
					data: {
						eventName,
						category: oneOf(Category, text(f, 'category'), 'category') ?? 'OTHER',
						startTime: time(f, 'startTime', 'Start'),
						endTime: time(f, 'endTime', 'Wrap'),
						priceGate: money(f, 'priceGate', 'Gate price'),
						priceAdvance: money(f, 'priceAdvance', 'Advance price'),
						priceNote: text(f, 'priceNote'),
						lineup: text(f, 'lineup'),
						register: oneOf(Register, text(f, 'register'), 'register')
					}
				});
				if (count === 0) throw new Invalid('This night changed since you loaded the page — reload to see the latest.');
				await savePerks(tx, { occurrenceId: params.id }, f);
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
