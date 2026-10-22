// The venue itself: creating one, and saving its name, place and contact
// details outside a call. Each lives in exactly one function here — the venue
// list, the venue record, the call queue, /add and the act call all come
// through these, so two screens never write one field by two code paths.
// One place to CALL (the call screen) and one write PATH — not one screen.
//
// Typing a number is not a phone call, and editing an address is not contact:
// nothing here touches lastContacted or nextContactDue after creation — only a
// saved call writes them.

import { prisma, ContactRole } from './prisma.js';
import type { Tx } from './db.js';
import { Invalid, oneOf, phone, slug, text } from './forms.js';
import { kampalaToday } from '#lib/build/week.js';

/** The area vocabulary, for the resolver in #lib/place and the areas picker. */
export const areaVocabulary = () =>
	prisma.areaZone.findMany({ orderBy: { area: 'asc' }, select: { area: true, zoneName: true } });

async function checkZone(db: Tx, zone: string | null) {
	if (zone && !(await db.zone.findUnique({ where: { name: zone } }))) throw new Invalid(`${zone} isn’t a zone.`);
	return zone;
}

export interface NewVenue {
	name: string;
	id?: string | null; //  an override of the slug, typed at creation; never changed after
	location?: string | null;
	zoneName?: string | null;
	phone?: string | null;
	whatsapp?: boolean;
}

/**
 * The one way a venue comes into existence. A venue nobody has called is a
 * Tier C lead, due today: that's what puts it on Thursday's call round, and a
 * null nextContactDue would mean it silently never surfaces. No source, no
 * claim — a venue existing is not a claim that any night is happening — and no
 * areas, which are surroundings an address doesn't tell you.
 */
export async function createVenue(db: Tx, v: NewVenue) {
	const name = v.name.trim();
	if (!name) throw new Invalid('The venue needs a name.');
	let id: string;
	if (v.id?.trim()) {
		id = slug(v.id);
		if (!id) throw new Invalid('The id needs letters or numbers in it.');
		if (await db.venue.findUnique({ where: { id } })) throw new Invalid(`The id ${id} is taken — pick another, or clear it to use the name.`);
	} else {
		const base = slug(name);
		if (!base) throw new Invalid('The venue needs a name with letters in it.');
		id = base;
		for (let n = 2; await db.venue.findUnique({ where: { id } }); n++) id = `${base}-${n}`;
	}
	return db.venue.create({
		data: {
			id,
			name,
			location: v.location?.trim() || null,
			zoneName: await checkZone(db, v.zoneName ?? null),
			phone: v.phone ?? null,
			whatsapp: v.whatsapp ?? false,
			tier: 'C',
			nextContactDue: new Date(`${kampalaToday()}T00:00:00+03:00`)
		}
	});
}

/** createVenue from the venue list's blank row. */
export const createVenueFrom = (f: FormData) =>
	createVenue(prisma, {
		name: text(f, 'name') ?? '',
		id: text(f, 'id'),
		location: text(f, 'location'),
		zoneName: text(f, 'zoneName'),
		phone: phone(f, 'phone'),
		whatsapp: f.get('whatsapp') === 'on' || f.get('whatsapp') === 'true'
	});

/**
 * Save whichever of a venue's own fields the form sent: number, WhatsApp and
 * zone (the list, the call queue and the record), who to ask for and their
 * role, name, location and areas (the record). The id never changes — renaming
 * doesn't re-derive the slug. Never lastContacted or nextContactDue: a venue
 * whose number was just found stays in the call queue until someone rings it.
 */
export async function saveVenue(f: FormData) {
	const id = text(f, 'id');
	const seen = text(f, 'updatedAt');
	if (!id || !seen) throw new Invalid('Missing venue — reload the page.');

	const current = await prisma.venue.findUnique({ where: { id }, select: { phone: true } });
	if (!current) throw new Invalid('That venue is no longer in the register.');

	const data: {
		phone?: string | null;
		phoneVerifiedAt?: null;
		whatsapp?: boolean;
		contactName?: string | null;
		contactRole?: ContactRole | null;
		zoneName?: string | null;
		name?: string;
		location?: string | null;
		areas?: string[];
	} = {};
	if (f.has('phone')) {
		data.phone = phone(f, 'phone');
		// A number nobody has answered yet isn't verified, whatever it replaced.
		if (data.phone !== current.phone) data.phoneVerifiedAt = null;
	}
	if (f.has('whatsapp')) data.whatsapp = f.get('whatsapp') === 'on' || f.get('whatsapp') === 'true';
	if (f.has('contactName')) data.contactName = text(f, 'contactName');
	if (f.has('contactRole')) data.contactRole = oneOf(ContactRole, text(f, 'contactRole'), 'role');
	if (f.has('zoneName')) data.zoneName = await checkZone(prisma, text(f, 'zoneName'));
	if (f.has('name')) {
		const name = text(f, 'name');
		if (!name) throw new Invalid('The venue needs a name.');
		data.name = name;
	}
	if (f.has('location')) data.location = text(f, 'location');
	// Present even when empty, so clearing every chip is a save, not a no-op.
	if (f.has('areasSent')) {
		const areas = [...new Set(f.getAll('areas').map((a) => String(a).trim()).filter(Boolean))];
		const known = new Set((await prisma.areaZone.findMany({ where: { area: { in: areas } }, select: { area: true } })).map((a) => a.area));
		const unknown = areas.filter((a) => !known.has(a));
		if (unknown.length) throw new Invalid(`${unknown.join(', ')} ${unknown.length > 1 ? 'aren’t areas' : 'isn’t an area'} in the vocabulary — pick from the list.`);
		data.areas = areas;
	}

	// Only if nobody else changed the row since it was loaded.
	const { count } = await prisma.venue.updateMany({ where: { id, updatedAt: new Date(seen) }, data });
	if (count === 0) throw new Invalid('This venue changed since you loaded the page — reload to see the latest before editing.');

	const saved = await prisma.venue.findUniqueOrThrow({
		where: { id },
		select: { name: true, location: true, areas: true, phone: true, whatsapp: true, contactName: true, contactRole: true, zoneName: true, phoneVerifiedAt: true, updatedAt: true }
	});
	return { id, ...saved, phoneVerifiedAt: saved.phoneVerifiedAt?.toISOString() ?? null, updatedAt: saved.updatedAt.toISOString() };
}
