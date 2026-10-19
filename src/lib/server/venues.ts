// Saving a venue's contact details outside a call: the venue list and the call
// queue. Typing a number is not a phone call — this never touches lastContacted
// or nextContactDue, which only a saved call writes.

import { prisma } from './prisma.js';
import { Invalid, phone, text } from './forms.js';

export async function saveContact(f: FormData) {
	const id = text(f, 'id');
	const seen = text(f, 'updatedAt');
	if (!id || !seen) throw new Invalid('Missing venue — reload the page.');

	const current = await prisma.venue.findUnique({ where: { id }, select: { phone: true } });
	if (!current) throw new Invalid('That venue is no longer in the register.');

	const data: { phone?: string | null; phoneVerifiedAt?: null; whatsapp?: boolean; zoneName?: string | null } = {};
	if (f.has('phone')) {
		data.phone = phone(f, 'phone');
		// A number nobody has answered yet isn't verified, whatever it replaced.
		if (data.phone !== current.phone) data.phoneVerifiedAt = null;
	}
	if (f.has('whatsapp')) data.whatsapp = f.get('whatsapp') === 'on' || f.get('whatsapp') === 'true';
	if (f.has('zoneName')) {
		const zone = text(f, 'zoneName');
		if (zone && !(await prisma.zone.findUnique({ where: { name: zone } }))) throw new Invalid(`${zone} isn’t a zone.`);
		data.zoneName = zone;
	}

	// Only if nobody else changed the row since it was loaded.
	const { count } = await prisma.venue.updateMany({ where: { id, updatedAt: new Date(seen) }, data });
	if (count === 0) throw new Invalid('This venue changed since you loaded the page — reload to see the latest before editing.');

	const saved = await prisma.venue.findUniqueOrThrow({
		where: { id },
		select: { phone: true, whatsapp: true, zoneName: true, phoneVerifiedAt: true, updatedAt: true }
	});
	return { id, ...saved, phoneVerifiedAt: saved.phoneVerifiedAt?.toISOString() ?? null, updatedAt: saved.updatedAt.toISOString() };
}
