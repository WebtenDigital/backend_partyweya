-- Acts: the performers PartyWeya has taken a view on, and lineups as the
-- billing as advertised — an ordered list of names, resolved to acts by
-- matching name or alias. Nothing here rewrites a lineup after this
-- one-off conversion from free text.

DROP VIEW IF EXISTS public_events;

CREATE TYPE "ActRole" AS ENUM ('BAND', 'DJ', 'COMEDIAN', 'POET', 'ACOUSTIC_ACT', 'HOST', 'ARTIST', 'OTHER');

CREATE TABLE "Act" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "role" "ActRole",
    "transfers" BOOLEAN,
    "transfersNote" TEXT,
    "lastSeen" TIMESTAMP(3),
    "organiserId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Act_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Act_name_key" ON "Act"("name");
CREATE INDEX "Act_aliases_idx" ON "Act" USING GIN ("aliases");
ALTER TABLE "Act" ADD CONSTRAINT "Act_organiserId_fkey" FOREIGN KEY ("organiserId") REFERENCES "Organiser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Saying yes to transfers needs a reason.
ALTER TABLE "Act" ADD CONSTRAINT act_transfers_needs_note
  CHECK ("transfers" IS DISTINCT FROM true OR nullif(btrim("transfersNote"), '') IS NOT NULL);

ALTER TABLE "Act" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "Act" FROM anon, authenticated;

-- Free-text lineups become lists, split where the text already separated
-- names: "Tyra; Kamali; Marvin; Zaga", "D Maestroz Band featuring Iryn Namubiru".
ALTER TABLE "Residency" ALTER COLUMN "lineup" TYPE TEXT[] USING (
  CASE WHEN "lineup" IS NULL THEN ARRAY[]::TEXT[]
       ELSE array_remove(regexp_split_to_array(btrim("lineup"), '\s*(;|,|\s+featuring\s+|\s+feat\.?\s+|\s+ft\.?\s+)\s*', 'i'), '') END);
ALTER TABLE "Residency" ALTER COLUMN "lineup" SET DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Occurrence" ALTER COLUMN "lineup" TYPE TEXT[] USING (
  CASE WHEN "lineup" IS NULL THEN ARRAY[]::TEXT[]
       ELSE array_remove(regexp_split_to_array(btrim("lineup"), '\s*(;|,|\s+featuring\s+|\s+feat\.?\s+|\s+ft\.?\s+)\s*', 'i'), '') END);
ALTER TABLE "Occurrence" ALTER COLUMN "lineup" SET DEFAULT ARRAY[]::TEXT[];
CREATE INDEX "Residency_lineup_idx" ON "Residency" USING GIN ("lineup");
CREATE INDEX "Occurrence_lineup_idx" ON "Occurrence" USING GIN ("lineup");

-- ─── Resolving a billed name to an act ──────────────────────────────
CREATE FUNCTION act_for(billed TEXT) RETURNS "Act"
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a FROM "Act" a
  WHERE lower(a."name") = lower(btrim(billed))
     OR lower(btrim(billed)) = ANY (SELECT lower(x) FROM unnest(a."aliases") x)
  LIMIT 1
$$;

-- "A", "A and B", "A, B and C"
CREATE FUNCTION plain_list(names TEXT[]) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE coalesce(cardinality(names), 0)
    WHEN 0 THEN ''
    WHEN 1 THEN names[1]
    ELSE array_to_string(names[1:cardinality(names) - 1], ', ') || ' and ' || names[cardinality(names)]
  END
$$;

-- THE billing line. Nobody types the connective words: they come from each
-- act's role. All one role (or all unclassified) → a plain list. Otherwise:
-- an ARTIST alongside a BAND joins with "with"; DJs among others go
-- "X on the decks"; HOSTs close with "hosted by X". Names keep their
-- billed spelling and order. One function, so there's one place to fix it.
CREATE FUNCTION compose_billing(lineup TEXT[]) RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  billed TEXT; r "ActRole";
  roles TEXT[] := '{}'; lead TEXT[] := '{}'; artists TEXT[] := '{}'; djs TEXT[] := '{}'; hosts TEXT[] := '{}';
  has_band BOOLEAN := false; names TEXT[] := '{}'; result TEXT;
BEGIN
  FOREACH billed IN ARRAY coalesce(lineup, '{}') LOOP
    billed := btrim(billed);
    CONTINUE WHEN billed = '';
    names := names || billed;
    r := (act_for(billed))."role";
    roles := roles || coalesce(r::TEXT, '-');
    IF r = 'HOST' THEN hosts := hosts || billed;
    ELSIF r = 'DJ' THEN djs := djs || billed;
    ELSIF r = 'ARTIST' THEN artists := artists || billed;
    ELSE
      lead := lead || billed;
      IF r = 'BAND' THEN has_band := true; END IF;
    END IF;
  END LOOP;

  IF cardinality(names) = 0 THEN RETURN NULL; END IF;
  IF (SELECT count(DISTINCT x) FROM unnest(roles) x) = 1 THEN RETURN plain_list(names); END IF;

  IF cardinality(artists) > 0 AND has_band THEN
    result := plain_list(lead) || ' with ' || plain_list(artists);
  ELSE
    result := plain_list(lead || artists);
  END IF;
  IF cardinality(djs) > 0 THEN
    result := CASE WHEN result = '' THEN plain_list(djs) || ' on the decks'
                   ELSE result || ', ' || plain_list(djs) || ' on the decks' END;
  END IF;
  IF cardinality(hosts) > 0 THEN
    result := CASE WHEN result = '' THEN 'hosted by ' || plain_list(hosts)
                   ELSE result || ', hosted by ' || plain_list(hosts) END;
  END IF;
  RETURN result;
END
$$;

-- ─── TRANSFERRED needs an act whose own record transfers ────────────
-- Spans tables, so a trigger rather than a CHECK. A dated row with no
-- lineup of its own is judged on its standing night's.
CREATE FUNCTION enforce_transferred() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE billed TEXT[];
BEGIN
  IF NEW."claimType" IS DISTINCT FROM 'TRANSFERRED' THEN RETURN NEW; END IF;
  billed := NEW."lineup";
  IF TG_TABLE_NAME = 'Occurrence' THEN
    IF coalesce(cardinality(billed), 0) = 0 AND NEW."residencyId" IS NOT NULL THEN
      SELECT "lineup" INTO billed FROM "Residency" WHERE "id" = NEW."residencyId";
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(coalesce(billed, '{}')) n WHERE (act_for(n))."transfers") THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'transferred_needs_transferring_act: no act in this lineup transfers'
    USING ERRCODE = '23514';
END
$$;
CREATE TRIGGER occurrence_transferred BEFORE INSERT OR UPDATE OF "claimType", "lineup", "residencyId" ON "Occurrence"
  FOR EACH ROW EXECUTE FUNCTION enforce_transferred();
CREATE TRIGGER residency_transferred BEFORE INSERT OR UPDATE OF "claimType", "lineup" ON "Residency"
  FOR EACH ROW EXECUTE FUNCTION enforce_transferred();

-- ─── public_events: the billing, composed ───────────────────────────
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
  coalesce((
    SELECT jsonb_agg(
             jsonb_build_object('kind', p."kind", 'label', p."label", 'condition', p."condition")
             ORDER BY p."sortOrder", p."createdAt")
    FROM "Perk" p
    WHERE CASE WHEN EXISTS (SELECT 1 FROM "Perk" op WHERE op."occurrenceId" = o."id")
               THEN p."occurrenceId" = o."id"
               ELSE p."residencyId" = o."residencyId" END
      AND (p."activeUntil" IS NULL
           OR ((p."activeUntil" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Kampala')::date >= o."date")
  ), '[]'::jsonb) AS perks,
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
