-- Register v2 (schema.prisma reconciled 19 Oct 2026) plus post_migrate.sql.

-- public_events depends on Venue.zone/division; rebuilt at the end.
DROP VIEW IF EXISTS public_events;

-- Categories that were in the sheet's dropdown but not the enum.
ALTER TYPE "Category" ADD VALUE 'SPORTS_SCREENING' BEFORE 'MOVIE_NIGHT';
ALTER TYPE "Category" ADD VALUE 'THEMED_NIGHT' BEFORE 'MOVIE_NIGHT';

-- Zone: still being corrected, so a table with a flag and an order.
ALTER TABLE "Zone" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "sortOrder" INTEGER;
CREATE INDEX "Zone_division_idx" ON "Zone"("division");

-- Venue: zone becomes a foreign key; division now comes from the Zone.
-- Renamed, not dropped and re-added, so existing placements survive.
ALTER TABLE "Venue" RENAME COLUMN "zone" TO "zoneName";
ALTER INDEX "Venue_zone_idx" RENAME TO "Venue_zoneName_idx";
ALTER TABLE "Venue" DROP COLUMN "division";
CREATE INDEX "Venue_nextContactDue_idx" ON "Venue"("nextContactDue");
CREATE INDEX "Venue_areas_idx" ON "Venue" USING GIN ("areas");

-- Free-text zones that aren't on the map can't satisfy the FK; unplace them
-- and let the import put them back.
UPDATE "Venue" SET "zoneName" = NULL
WHERE "zoneName" IS NOT NULL AND "zoneName" NOT IN (SELECT "name" FROM "Zone");

ALTER TABLE "Venue" ADD CONSTRAINT "Venue_zoneName_fkey" FOREIGN KEY ("zoneName") REFERENCES "Zone"("name") ON DELETE SET NULL ON UPDATE CASCADE;

-- Organiser: promoters, agents and hosts who are not the venue.
CREATE TABLE "Organiser" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "role" "ContactRole",
    "phone" TEXT,
    "whatsapp" BOOLEAN NOT NULL DEFAULT false,
    "paidClient" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organiser_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Organiser_name_key" ON "Organiser"("name");

-- Residency: no advance price on a standing night; optional organiser.
ALTER TABLE "Residency" DROP COLUMN "priceAdvance",
ADD COLUMN "organiserId" TEXT;
CREATE UNIQUE INDEX "Residency_venueId_dayOfWeek_eventName_key" ON "Residency"("venueId", "dayOfWeek", "eventName");
ALTER TABLE "Residency" ADD CONSTRAINT "Residency_organiserId_fkey" FOREIGN KEY ("organiserId") REFERENCES "Organiser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Occurrence" ADD COLUMN "organiserId" TEXT;
ALTER TABLE "Occurrence" ADD CONSTRAINT "Occurrence_organiserId_fkey" FOREIGN KEY ("organiserId") REFERENCES "Organiser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Guards Prisma can't express (post_migrate.sql) ───────────────────

-- Advance must be cheaper than the gate, or it isn't an advance price.
ALTER TABLE "Occurrence" ADD CONSTRAINT advance_cheaper_than_gate
  CHECK ("priceAdvance" IS NULL OR "priceGate" IS NULL OR "priceAdvance" < "priceGate");

-- Prices are in shillings and cannot be negative.
ALTER TABLE "Occurrence" ADD CONSTRAINT prices_not_negative
  CHECK (coalesce("priceGate", 0) >= 0 AND coalesce("priceAdvance", 0) >= 0);
ALTER TABLE "Residency" ADD CONSTRAINT price_not_negative
  CHECK (coalesce("priceGate", 0) >= 0);

-- dayOfWeek is 1–7, Monday first.
ALTER TABLE "Residency" ADD CONSTRAINT day_of_week_range
  CHECK ("dayOfWeek" BETWEEN 1 AND 7);

-- Times are 24-hour wall clock, "19:00". No timezone arithmetic, ever.
ALTER TABLE "Residency" ADD CONSTRAINT start_time_format
  CHECK ("startTime" IS NULL OR "startTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
ALTER TABLE "Occurrence" ADD CONSTRAINT occ_start_time_format
  CHECK ("startTime" IS NULL OR "startTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

-- confirmation_is_complete (confirmedOn and confirmedBy together) is held
-- back until the two confirmed rows have their confirmedOn dates.

-- VETTED means PartyWeya attended; it may not rest on a listing.
ALTER TABLE "Occurrence" ADD CONSTRAINT vetted_is_not_a_listing
  CHECK ("claimType" <> 'VETTED' OR lower(coalesce("source", '')) NOT IN
         ('quicket', 'social media', 'flyer', 'poster'));

-- An area array should never hold an empty string.
ALTER TABLE "Venue" ADD CONSTRAINT areas_have_no_blanks
  CHECK (NOT ('' = ANY("areas")));

-- ─── Access ───────────────────────────────────────────────────────────

-- Organiser holds contacts: locked like the other base tables.
ALTER TABLE "Organiser" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "Organiser" FROM anon, authenticated;

-- Zone is public-safe (names and divisions, for a zone filter). It has RLS
-- on, so the grant needs a read policy to return rows.
GRANT SELECT ON "Zone" TO anon, authenticated;
CREATE POLICY zone_public_read ON "Zone" FOR SELECT TO anon, authenticated USING (true);

-- ─── The public view — the only thing the website reads ─────────────
-- Owner's rights over the locked tables; public-safe columns only.
-- "Today" is Kampala's date, not the server's UTC date.
CREATE VIEW public_events
WITH (security_invoker = false) AS
SELECT
  o."id",
  o."date",
  o."eventName"    AS event_name,
  o."category",
  o."register",
  o."startTime"    AS start_time,
  o."endTime"      AS end_time,
  o."priceGate"    AS price_gate,
  o."priceAdvance" AS price_advance,
  o."priceNote"    AS price_note,
  o."lineup",
  o."claimType"    AS claim_type,
  v."id"           AS venue_id,
  v."name"         AS venue,
  v."location",
  v."areas",
  z."name"         AS zone,
  z."division"
FROM "Occurrence" o
JOIN "Venue" v ON v."id" = o."venueId"
LEFT JOIN "Zone" z ON z."name" = v."zoneName"
WHERE o."status" = 'CONFIRMED'
  AND o."startTime" IS NOT NULL
  AND o."register" IS NOT NULL
  AND o."date" >= (now() AT TIME ZONE 'Africa/Kampala')::date;

GRANT SELECT ON public_events TO anon, authenticated;
