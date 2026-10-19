-- Occurrence.source becomes a vocabulary, and the VETTED rule becomes
-- exhaustive: only ATTENDED can carry it (source_enum.sql).

CREATE TYPE "Source" AS ENUM (
  'ATTENDED', 'OWNER', 'MANAGER', 'PROMOTER', 'AGENT',
  'TICKETING', 'SOCIAL_MEDIA', 'FLYER', 'PRESS', 'AUDIENCE');

ALTER TABLE "Occurrence" ADD COLUMN "source_new" "Source";

UPDATE "Occurrence" SET "source_new" = CASE
  WHEN lower(coalesce("source", '')) IN ('attended', 'partyweya', 'went')   THEN 'ATTENDED'
  WHEN lower(coalesce("source", '')) = 'owner'                              THEN 'OWNER'
  WHEN lower(coalesce("source", '')) = 'manager'                            THEN 'MANAGER'
  WHEN lower(coalesce("source", '')) LIKE 'promoter%'                       THEN 'PROMOTER'
  WHEN lower(coalesce("source", '')) LIKE 'agent%'                          THEN 'AGENT'
  WHEN lower(coalesce("source", '')) IN ('quicket', 'mticket', 'ticketing') THEN 'TICKETING'
  WHEN lower(coalesce("source", '')) = 'social media'                       THEN 'SOCIAL_MEDIA'
  WHEN lower(coalesce("source", '')) IN ('flyer', 'poster')                 THEN 'FLYER'
  WHEN lower(coalesce("source", '')) = 'press'                              THEN 'PRESS'
  WHEN lower(coalesce("source", '')) LIKE 'audience%'                       THEN 'AUDIENCE'
  ELSE NULL END::"Source";

-- Nothing should be left behind; fail loudly if the mapping missed one.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM "Occurrence"
   WHERE "source" IS NOT NULL AND "source" <> '' AND "source_new" IS NULL;
  IF n > 0 THEN RAISE EXCEPTION 'unmapped source values: %', n; END IF;
END $$;

ALTER TABLE "Occurrence" DROP COLUMN "source";
ALTER TABLE "Occurrence" RENAME COLUMN "source_new" TO "source";

-- VETTED means PartyWeya was in the room. Nothing else can carry it —
-- including no source at all: coalesce turns the NULL a missing source
-- would produce (which a CHECK treats as a pass) into a rejection.
ALTER TABLE "Occurrence" DROP CONSTRAINT IF EXISTS vetted_is_not_a_listing;
ALTER TABLE "Occurrence" ADD CONSTRAINT vetted_means_attended
  CHECK ("claimType" IS DISTINCT FROM 'VETTED' OR coalesce("source" = 'ATTENDED', false));
