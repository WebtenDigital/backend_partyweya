import { fail } from '@sveltejs/kit';
import { prisma } from '#lib/server/prisma.js';
import { Invalid, failureMessage, text } from '#lib/server/forms.js';
import { SUBJECT_COLUMN, reminderHealth, reminders, type SubjectKind } from '#lib/server/reminders.js';
import { asDate } from '#lib/server/register.js';
import { kampalaToday } from '#lib/build/week.js';
import type { Actions, PageServerLoad } from './$types';

// The small "done" view. Reminders live on the call queue and on the records
// they hang off; this page only exists to show what has been cleared.
export const load: PageServerLoad = async () => {
	const today = kampalaToday();
	const [open, done] = await Promise.all([reminders({}, today), reminders({ done: true }, today)]);
	return {
		today,
		done: done.sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? '')),
		health: await reminderHealth(open, today)
	};
};

class FieldError extends Invalid {
	constructor(
		public field: 'subject' | 'body' | 'due',
		message: string
	) {
		super(message);
	}
}

export const actions: Actions = {
	// Writing one. The subject is asked for first, and a reminder without one is refused —
	// otherwise this becomes a to-do list the register happens to host.
	add: async ({ request }) => {
		const f = await request.formData();
		try {
			const [kind, id] = (text(f, 'subject') ?? '').split(':') as [SubjectKind | undefined, string | undefined];
			const column = kind ? SUBJECT_COLUMN[kind] : undefined;
			if (!column || !id) throw new FieldError('subject', 'Pick what this is about first — a venue, an act, an organiser or a night.');
			const body = text(f, 'body');
			if (!body) throw new FieldError('body', 'Say what you need to do.');
			const due = text(f, 'dueOn');
			if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) throw new FieldError('due', 'The due date must be a date.');

			const exists = await (prisma[kind as SubjectKind] as unknown as { count: (a: object) => Promise<number> }).count({ where: { id } });
			if (!exists) throw new FieldError('subject', 'That record is no longer in the register.');

			await prisma.reminder.create({ data: { body, [column]: id, dueOn: due ? asDate(due) : null } });
			return { added: true };
		} catch (e) {
			if (e instanceof FieldError) return fail(400, { error: e.message, field: e.field });
			const message = failureMessage(e);
			if (message) return fail(400, { error: message, field: 'subject' });
			console.error(e);
			return fail(500, { error: 'The save failed. Nothing was written.', field: null });
		}
	},

	// Done is a timestamp, never a delete: the cleared ratio is the only evidence
	// of whether writing reminders is working.
	done: async ({ request }) => {
		const id = text(await request.formData(), 'id');
		if (!id) return fail(400, { error: 'Which reminder?', field: null });
		await prisma.reminder.updateMany({ where: { id, doneAt: null }, data: { doneAt: new Date() } });
		return { done: true };
	},

	// Ticked by mistake.
	reopen: async ({ request }) => {
		const id = text(await request.formData(), 'id');
		if (!id) return fail(400, { error: 'Which reminder?', field: null });
		await prisma.reminder.updateMany({ where: { id }, data: { doneAt: null } });
		return { reopened: true };
	}
};
