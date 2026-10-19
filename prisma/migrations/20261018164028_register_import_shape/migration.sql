-- Reshape the register to match the fixed CSVs (partyweya_register_fixed).

-- public_listing depends on Venue.slug/area and the cost* columns; it is
-- replaced by public_events at the end of this migration.
DROP VIEW IF EXISTS public_listing;

-- MOVIE_NIGHT is a real category, not an OTHER.
ALTER TYPE "Category" ADD VALUE 'MOVIE_NIGHT' BEFORE 'OTHER';

-- They are prices, not costs.
ALTER TABLE "Residency"  RENAME COLUMN "costGate"    TO "priceGate";
ALTER TABLE "Residency"  RENAME COLUMN "costAdvance" TO "priceAdvance";
ALTER TABLE "Occurrence" RENAME COLUMN "costGate"    TO "priceGate";
ALTER TABLE "Occurrence" RENAME COLUMN "costAdvance" TO "priceAdvance";

-- Venue: slug was identical to id; "area" becomes a real list of areas,
-- plus the zone/division it sits in and street-level directions.
DROP INDEX "Venue_slug_key";
ALTER TABLE "Venue" DROP COLUMN "slug",
DROP COLUMN "area",
ADD COLUMN     "areas" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "division" TEXT,
ADD COLUMN     "location" TEXT,
ALTER COLUMN "zone" DROP NOT NULL,
ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- Residency: start time is often unknown until the call; notes carry hosts/bands.
ALTER TABLE "Residency" ADD COLUMN "notes" TEXT,
ALTER COLUMN "startTime" DROP NOT NULL,
ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- Occurrence: advertised price tiers that don't fit gate/advance.
ALTER TABLE "Occurrence" ADD COLUMN "priceNote" TEXT,
ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- The zone map. Internal like everything else: RLS on, no grants.
CREATE TABLE "Zone" (
    "name" TEXT NOT NULL,
    "division" TEXT NOT NULL,

    CONSTRAINT "Zone_pkey" PRIMARY KEY ("name")
);
ALTER TABLE "Zone" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "Zone" FROM anon, authenticated;

-- The public view, rebuilt on the new columns. Same security model as
-- public_listing: owner's rights over locked tables, public-safe columns only.
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
  o."priceGate"    AS price_gate,
  o."priceAdvance" AS price_advance,
  o."priceNote"    AS price_note,
  o."lineup",
  v."name"         AS venue,
  v."location",
  v."zone",
  v."division",
  v."areas"
FROM "Occurrence" o
JOIN "Venue" v ON v."id" = o."venueId"
WHERE o."status" = 'CONFIRMED'
  AND o."startTime" IS NOT NULL
  AND o."register" IS NOT NULL
  AND o."date" >= (now() AT TIME ZONE 'Africa/Kampala')::date;

GRANT SELECT ON public_events TO anon, authenticated;
