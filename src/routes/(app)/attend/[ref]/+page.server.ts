import { error, fail, redirect } from '@sveltejs/kit';
import { prisma, ConversationTest, Register } from '#lib/server/prisma.js';
import { Invalid, failureMessage, money, oneOf, text, time } from '#lib/server/forms.js';
import { isoDate, kampalaDate } from '#lib/server/register.js';
import { recordVisit, visitNight } from '#lib/server/visit.js';
import { isoDay } from '#lib/build/add.js';
import { addDays, kampalaToday } from '#lib/build/week.js';
import type { Actions, PageServerLoad } from './$types';

// The visit write-up — what comes back from the weekly attendance, filled the
// same night or the next morning, on a phone. Not a call: it never touches
// lastContacted, so the night stays on the call round — only the venue knows
// whether next week is off. The writing itself is recordVisit (visit.ts).

/** The most recent date on or before `today` that falls on ISO weekday `dow`. */
const lastOn = (today: string, dow: number) => addDays(today, -((isoDay(today) - dow + 7) % 7));

export const load: PageServerLoad = async ({ params, url }) => {
	const n = await visitNight(prisma, params.ref);
	if (!n) error(404, 'No such night');
	const today = kampalaToday();
	const asked = url.searchParams.get('date');
	const date =
		n.kind === 'occurrence'
			? isoDate(n.occurrence.date)
			: asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) && asked <= today
				? asked
				: lastOn(today, n.residency.dayOfWeek); // the write-up is often the next morning
	const row = n.kind === 'residency' ? n.residency : n.occurrence;
	return {
		today,
		night: {
			kind: n.kind,
			id: n.id,
			eventName: n.eventName,
			dayOfWeek: n.kind === 'residency' ? n.residency.dayOfWeek : null,
			date,
			venue: { id: n.venue.id, name: n.venue.name, zone: n.venue.zoneName },
			said: n.said,
			// The prediction, shown beside the judgement: the experiment on question 6.
			predicted: {
				register: n.venue.provisionalRegister,
				from: n.venue.conversationTest,
				at: kampalaDate(n.venue.conversationTestAt)
			},
			attendedAt: row.attendedAt ? isoDate(row.attendedAt) : null,
			attendedBy: row.attendedBy,
			record: n.kind === 'residency' ? `/residencies/${n.id}` : `/occurrences/${n.id}`
		}
	};
};

export const actions: Actions = {
	save: async ({ params, request }) => {
		const f = await request.formData();
		const today = kampalaToday();
		let back: string;
		try {
			// The verdict and the register: required, no default — "doesn't clear" is as
			// much a result as "clears", and costs exactly one tap.
			const verdict = text(f, 'clears');
			if (verdict !== 'yes' && verdict !== 'no') throw new Invalid('The verdict: does it clear the gate, or not? Either is a result.');
			const register = oneOf(Register, text(f, 'register'), 'register');
			if (!register) throw new Invalid('Which register was the room?');
			const nothingDiffered = f.get('nothingDiffered') === 'on';
			const lineup = (text(f, 'actualLineup') ?? '').split(/[,;]/).map((s) => s.trim()).filter(Boolean);
			const saved = await prisma.$transaction(
				(tx) =>
					recordVisit(tx, {
						ref: params.ref,
						date: text(f, 'date') ?? '',
						arrivedAt: time(f, 'arrivedAt', 'Arrived'),
						leftAt: time(f, 'leftAt', 'Left'),
						clears: verdict === 'yes',
						register,
						// Optional: an unknown value is dropped rather than refusing the save.
						observedConversation: (Object.values(ConversationTest) as string[]).includes(text(f, 'observed') ?? '') ? (text(f, 'observed') as ConversationTest) : null,
						nothingDiffered,
						actualStartTime: time(f, 'actualStartTime', 'Actual start'),
						actualPrice: money(f, 'actualPrice', 'Actual gate price'),
						actualLineup: lineup,
						correct: { start: f.get('correctStart') === 'on', price: f.get('correctPrice') === 'on', lineup: f.get('correctLineup') === 'on' },
						vettedNote: text(f, 'vettedNote'),
						leads: String(f.get('leads') ?? '').split('\n'),
						costEntry: money(f, 'costEntry', 'Entry'),
						costTransport: money(f, 'costTransport', 'Transport'),
						costSpend: money(f, 'costSpend', 'Spend'),
						initials: (text(f, 'initials') ?? '').toUpperCase(),
						today
					}),
				{ timeout: 20_000 }
			);
			back = `${saved.record}?attended=${saved.date}`;
		} catch (e) {
			const message = failureMessage(e);
			if (message) return fail(400, { error: message });
			console.error(e);
			return fail(500, { error: 'The save failed. Nothing was written.' });
		}
		redirect(303, back);
	}
};
