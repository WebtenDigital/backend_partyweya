-- When discovery last got no answer, so it can try again the next working day
-- without reading Venue.nextContactDue (replaced by a derivation; left unread
-- until the contract step). Pure expand: one nullable column.
ALTER TABLE "Venue" ADD COLUMN "lastAttemptAt" TIMESTAMP(3);
