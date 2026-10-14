-- Lock the register down. Supabase grants anon/authenticated full access to
-- every table in public; those roles back the browser API key. The app talks
-- to the database as postgres (owner, bypasses RLS) via Prisma, so it is
-- unaffected. RLS with no policies = no rows for anyone else.

ALTER TABLE "Venue"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Residency"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Occurrence"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Publication" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON "Venue", "Residency", "Occurrence", "Publication"
  FROM anon, authenticated;

-- Prisma's bookkeeping table doesn't exist in the shadow database.
DO $$
BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON "_prisma_migrations" FROM anon, authenticated;
  END IF;
END $$;

-- Tables added by later migrations start closed too; expose them deliberately.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;

-- The public view: confirmed, fully-timed occurrences with public-safe venue
-- fields only (everything above the "internal only" line in Venue).
-- Deliberately security_invoker = false: it reads the locked tables with the
-- owner's rights, so anon can see these columns and nothing else.
CREATE VIEW public_listing
WITH (security_invoker = false) AS
SELECT
  o."id",
  o."date",
  o."startTime"   AS start_time,
  o."endTime"     AS end_time,
  o."eventName"   AS event_name,
  o."category",
  o."register",
  o."lineup",
  o."costGate"    AS cost_gate,
  o."costAdvance" AS cost_advance,
  v."name"        AS venue_name,
  v."slug"        AS venue_slug,
  v."zone",
  v."area"
FROM "Occurrence" o
JOIN "Venue" v ON v."id" = o."venueId"
WHERE o."status" = 'CONFIRMED'
  AND o."startTime" IS NOT NULL;

GRANT SELECT ON public_listing TO anon, authenticated;
