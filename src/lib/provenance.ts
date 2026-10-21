// The one authority for what PartyWeya may claim about a night. The operator
// only ever picks the source; the claim is derived from it here, on every
// write, and stored. Nothing else assigns claimType.
//
// Precedence: VETTED beats TRANSFERRED beats FACTUAL. TRANSFERRED is only ever
// an upgrade ON FACTUAL — it never rescues a row that would otherwise carry no
// claim: a reader reporting that a big act is playing is still an unbelieved
// lineup, and there is nothing to transfer from.
//
// Pure, with no imports that run: the browser (the add form's preview), the
// server, and the plain-Node import script all load this file. Whether a lineup
// bills a transferring act needs the database — that's lineupTransfers(), in
// #lib/server/provenance.ts.
//
// Stored, not computed at read: flipping an act's transfers flag later does not
// rewrite old rows. A recompute, if ever needed, is a script.

import type { ClaimType, Source } from '../generated/prisma/enums';

export function claimFor(source: Source | null, hasTransferringAct: boolean): ClaimType | null {
	switch (source) {
		case null:
			return null;
		case 'ATTENDED':
			return 'VETTED';
		// Someone suggested it: a lead to check, not a fact.
		case 'AUDIENCE':
			return null;
		// Every other source, including any added later, fails safe into FACTUAL.
		default:
			return hasTransferringAct ? 'TRANSFERRED' : 'FACTUAL';
	}
}
