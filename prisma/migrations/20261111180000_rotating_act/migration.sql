-- Rotating acts. Pure expand: one column, defaulted, and the TRANSFERRED
-- trigger taught about it. No row changes — every night starts not rotating.
ALTER TABLE "Residency" ADD COLUMN "rotatingAct" BOOLEAN NOT NULL DEFAULT false;

-- ─── TRANSFERRED on a rotating night needs THAT DATE's named lineup ───
-- A transferred claim rests on a named act with a record. A rotating night's
-- standing row promises an unnamed person every week, so it never transfers;
-- a dated row of it transfers only on its own lineup — it does not inherit
-- the standing night's (a house band beside the guest is billed on the date).
CREATE OR REPLACE FUNCTION enforce_transferred() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE billed TEXT[]; rotating BOOLEAN;
BEGIN
  IF NEW."claimType" IS DISTINCT FROM 'TRANSFERRED' THEN RETURN NEW; END IF;
  billed := NEW."lineup";
  IF TG_TABLE_NAME = 'Residency' AND NEW."rotatingAct" THEN
    RAISE EXCEPTION 'transferred_rotating_needs_dated_lineup: a different act every week transfers only on a date with a named lineup'
      USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'Occurrence' THEN
    IF coalesce(cardinality(billed), 0) = 0 AND NEW."residencyId" IS NOT NULL THEN
      SELECT "lineup", "rotatingAct" INTO billed, rotating FROM "Residency" WHERE "id" = NEW."residencyId";
      IF rotating THEN
        RAISE EXCEPTION 'transferred_rotating_needs_dated_lineup: name this date''s act before it can transfer'
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(coalesce(billed, '{}')) n WHERE (act_for(n))."transfers") THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'transferred_needs_transferring_act: no act in this lineup transfers'
    USING ERRCODE = '23514';
END
$$;

-- Turning a night rotating is checked too: it can't keep a claim it no longer earns.
DROP TRIGGER residency_transferred ON "Residency";
CREATE TRIGGER residency_transferred BEFORE INSERT OR UPDATE OF "claimType", "lineup", "rotatingAct" ON "Residency"
  FOR EACH ROW EXECUTE FUNCTION enforce_transferred();
