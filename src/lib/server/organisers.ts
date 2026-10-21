// The organiser picker's server half: pick one, create one inline, or clear.
// An Organiser is someone you can call back warmly — never an anonymous row.
// A number nobody can name stays on the night (bookingPhone) instead.

import { prisma, ContactRole } from './prisma.js';
import { Invalid, oneOf, phone, slug, text } from './forms.js';
import type { Tx } from './db.js';

export const NEW = '__new';

export async function organiserOptions() {
	return prisma.organiser.findMany({
		orderBy: { name: 'asc' },
		select: { id: true, name: true, contactName: true, role: true, phone: true }
	});
}
export type OrganiserOption = Awaited<ReturnType<typeof organiserOptions>>[number];

/**
 * What the picker named `p` posted: undefined if it wasn't on the form (leave
 * the night alone), null if cleared, otherwise an organiser id — created here,
 * inside the caller's transaction, when it's someone new. `number` is used for
 * a new organiser in place of a typed one (the flyer number they answered on).
 */
export async function organiserFrom(tx: Tx, f: FormData, p: string, number?: string | null): Promise<string | null | undefined> {
	if (!f.has(`${p}_id`)) return undefined;
	const id = text(f, `${p}_id`);
	if (!id) return null;
	if (id !== NEW) {
		if (!(await tx.organiser.findUnique({ where: { id }, select: { id: true } }))) throw new Invalid('That organiser is no longer in the roster.');
		return id;
	}
	const name = text(f, `${p}_name`);
	if (!name) throw new Invalid('The new organiser needs a name — the promoter or company, as they call themselves.');
	const same = await tx.organiser.findFirst({ where: { name: { equals: name, mode: 'insensitive' } }, select: { name: true } });
	if (same) throw new Invalid(`${same.name} is already in the roster — pick them instead of adding them again.`);
	let newId = slug(name);
	if (!newId) throw new Invalid('The organiser needs a name with letters in it.');
	if (await tx.organiser.findUnique({ where: { id: newId } })) newId = `${newId}-${Date.now().toString(36)}`;
	await tx.organiser.create({
		data: {
			id: newId,
			name,
			contactName: text(f, `${p}_contact`),
			role: oneOf(ContactRole, text(f, `${p}_role`), 'role'),
			// A typed number hasn't been answered yet: unverified, and no call is logged.
			phone: number !== undefined ? number : phone(f, `${p}_phone`),
			whatsapp: f.get(`${p}_whatsapp`) === 'on'
		}
	});
	return newId;
}
