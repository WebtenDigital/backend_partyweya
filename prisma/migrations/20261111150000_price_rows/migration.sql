-- Price rows. Pure expand: a new table and enum, a backfill that copies the
-- old price columns into rows, and public_events rebuilt. priceGate,
-- priceAdvance and priceNote stay in place, unread by the app from here on,
-- until the contract pass.
CREATE TYPE "PriceTiming" AS ENUM ('GATE', 'ADVANCE');

CREATE TABLE "Price" (
    "id" TEXT NOT NULL,
    "residencyId" TEXT,
    "occurrenceId" TEXT,
    "label" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "timing" "PriceTiming",
    "availableUntil" DATE,
    "perTable" BOOLEAN NOT NULL DEFAULT false,
    "seats" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Price_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Price_residencyId_idx" ON "Price"("residencyId");
CREATE INDEX "Price_occurrenceId_idx" ON "Price"("occurrenceId");
ALTER TABLE "Price" ADD CONSTRAINT "Price_residencyId_fkey" FOREIGN KEY ("residencyId") REFERENCES "Residency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Price" ADD CONSTRAINT "Price_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "Occurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A price belongs to exactly one standing night or one dated night.
ALTER TABLE "Price" ADD CONSTRAINT price_has_one_parent
  CHECK (("residencyId" IS NULL) <> ("occurrenceId" IS NULL));
ALTER TABLE "Price" ADD CONSTRAINT price_not_negative CHECK ("amount" >= 0);
ALTER TABLE "Price" ADD CONSTRAINT price_has_label CHECK (btrim("label") <> '');
-- Seats are a table's capacity: only on a per-table row, and at least one.
ALTER TABLE "Price" ADD CONSTRAINT price_seats_on_tables
  CHECK ("seats" IS NULL OR ("perTable" AND "seats" > 0));

ALTER TABLE "Price" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "Price" FROM anon, authenticated;

-- ─── Backfill (the same statements as scripts/price-backfill.sql) ──────
-- One row per non-null old column: priceGate → Entry/GATE, priceAdvance →
-- Advance/ADVANCE. Neither → no rows, which reads NOT ASKED YET.
INSERT INTO "Price" ("id", "residencyId", "label", "amount", "timing", "sortOrder")
  SELECT 'pg-' || "id", "id", 'Entry', "priceGate", 'GATE', 0 FROM "Residency" WHERE "priceGate" IS NOT NULL;
INSERT INTO "Price" ("id", "residencyId", "label", "amount", "timing", "sortOrder")
  SELECT 'pa-' || "id", "id", 'Advance', "priceAdvance", 'ADVANCE', 1 FROM "Residency" WHERE "priceAdvance" IS NOT NULL;
INSERT INTO "Price" ("id", "occurrenceId", "label", "amount", "timing", "sortOrder")
  SELECT 'pg-' || "id", "id", 'Entry', "priceGate", 'GATE', 0 FROM "Occurrence" WHERE "priceGate" IS NOT NULL;
INSERT INTO "Price" ("id", "occurrenceId", "label", "amount", "timing", "sortOrder")
  SELECT 'pa-' || "id", "id", 'Advance', "priceAdvance", 'ADVANCE', 1 FROM "Occurrence" WHERE "priceAdvance" IS NOT NULL;

-- ─── public_events: price rows, and offers added the week's way ──────
DROP VIEW IF EXISTS public_events;
CREATE VIEW public_events
WITH (security_invoker = false) AS
WITH billed AS (
  SELECT o.*,
         CASE WHEN coalesce(cardinality(o."lineup"), 0) > 0 THEN o."lineup" ELSE coalesce(r."lineup", '{}') END AS resolved_lineup
  FROM "Occurrence" o
  LEFT JOIN "Residency" r ON r."id" = o."residencyId"
)
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
  o.resolved_lineup AS lineup,
  compose_billing(o.resolved_lineup) AS billing,
  -- Offers: the standing night's, then this date's own — added, not replaced,
  -- the same rule as the week (resolvePerks); the same offer on both, once.
  coalesce((
    SELECT jsonb_agg(jsonb_build_object('kind', p."kind", 'label', p."label", 'condition', p."condition")
                     ORDER BY p.own, p."sortOrder", p."createdAt")
    FROM (
      SELECT DISTINCT ON (p."kind", lower(btrim(p."label"))) p.*, (p."occurrenceId" IS NOT NULL) AS own
      FROM "Perk" p
      WHERE (p."occurrenceId" = o."id" OR p."residencyId" = o."residencyId")
        AND (p."activeUntil" IS NULL
             OR ((p."activeUntil" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Kampala')::date >= o."date")
      ORDER BY p."kind", lower(btrim(p."label")), (p."occurrenceId" IS NOT NULL), p."sortOrder", p."createdAt"
    ) p
  ), '[]'::jsonb) AS perks,
  -- Prices: this date's own rows if it has any, else the standing night's.
  -- Raw rows, cheapest first; the published floor is derived in the app
  -- (src/lib/price.ts) as of a date, never here.
  coalesce((
    SELECT jsonb_agg(jsonb_build_object('label', pr."label", 'amount', pr."amount", 'timing', pr."timing",
                                        'available_until', pr."availableUntil", 'per_table', pr."perTable", 'seats', pr."seats")
                     ORDER BY pr."perTable", pr."amount", pr."sortOrder")
    FROM "Price" pr
    WHERE CASE WHEN EXISTS (SELECT 1 FROM "Price" op WHERE op."occurrenceId" = o."id")
               THEN pr."occurrenceId" = o."id"
               ELSE pr."residencyId" = o."residencyId" END
  ), '[]'::jsonb) AS prices,
  o."claimType"    AS claim_type,
  v."id"           AS venue_id,
  v."name"         AS venue,
  v."location",
  v."areas",
  z."name"         AS zone,
  z."division"
FROM billed o
JOIN "Venue" v ON v."id" = o."venueId"
LEFT JOIN "Zone" z ON z."name" = v."zoneName"
WHERE o."status" = 'CONFIRMED'
  AND o."startTime" IS NOT NULL
  AND o."register" IS NOT NULL
  AND o."date" >= (now() AT TIME ZONE 'Africa/Kampala')::date;

GRANT SELECT ON public_events TO anon, authenticated;
