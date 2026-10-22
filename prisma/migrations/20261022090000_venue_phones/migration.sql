-- A venue can have more than one number. Bios routinely list two with no hint
-- which is which; a single column threw the second away.
--
--   phones          every number, in the order to try them
--   verifiedPhone   the one a call actually answered (the value, not an index)
--   phoneVerifiedAt unchanged, now paired with verifiedPhone
--
-- Internal, like phone was: public_events lists its own columns and gains none.

ALTER TABLE "Venue" ADD COLUMN "phones" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "verifiedPhone" TEXT;

-- Every existing number becomes phones[0]; a verified one stays verified.
UPDATE "Venue" SET "phones" = ARRAY["phone"] WHERE "phone" IS NOT NULL;
UPDATE "Venue" SET "verifiedPhone" = "phone" WHERE "phone" IS NOT NULL AND "phoneVerifiedAt" IS NOT NULL;
-- A verification with no number left to point at means nothing.
UPDATE "Venue" SET "phoneVerifiedAt" = NULL WHERE "verifiedPhone" IS NULL;

ALTER TABLE "Venue" DROP COLUMN "phone";

-- Verified means one of the venue's own numbers, and says when.
ALTER TABLE "Venue" ADD CONSTRAINT "venue_verified_phone_listed"
  CHECK ("verifiedPhone" IS NULL OR "verifiedPhone" = ANY ("phones"));
ALTER TABLE "Venue" ADD CONSTRAINT "venue_verified_phone_dated"
  CHECK (("verifiedPhone" IS NULL) = ("phoneVerifiedAt" IS NULL));
