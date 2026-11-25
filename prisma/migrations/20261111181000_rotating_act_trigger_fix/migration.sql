-- Fix to 20261111180000_rotating_act: its trigger read NEW."rotatingAct" on
-- Occurrence rows too (plpgsql doesn't short-circuit AND), so any dated row
-- saved as TRANSFERRED failed with "column not found". Nothing carried
-- TRANSFERRED when it shipped. Same function, the Residency check nested.
CREATE OR REPLACE FUNCTION enforce_transferred() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE billed TEXT[]; rotating BOOLEAN;
BEGIN
  IF NEW."claimType" IS DISTINCT FROM 'TRANSFERRED' THEN RETURN NEW; END IF;
  billed := NEW."lineup";
  -- Nested, not AND: plpgsql may evaluate NEW."rotatingAct" on an Occurrence, which has no such column.
  IF TG_TABLE_NAME = 'Residency' THEN
    IF NEW."rotatingAct" THEN
      RAISE EXCEPTION 'transferred_rotating_needs_dated_lineup: a different act every week transfers only on a date with a named lineup'
        USING ERRCODE = '23514';
    END IF;
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
