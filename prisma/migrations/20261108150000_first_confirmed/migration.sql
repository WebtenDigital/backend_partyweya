-- When we first confirmed a standing night. lastConfirmed is overwritten on
-- every call, so there was no history to read; this keeps the one fact tier A
-- needs from it. Pure expand: one nullable column.
ALTER TABLE "Residency" ADD COLUMN "firstConfirmedAt" TIMESTAMP(3);

-- Set once, never overwritten — enforced here rather than in each of the code
-- paths that confirm a night (the call screen, discovery, /add, attendance,
-- the import), so none of them can forget or clobber it.
CREATE FUNCTION residency_first_confirmed() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."firstConfirmedAt" IS NOT NULL THEN
    NEW."firstConfirmedAt" := OLD."firstConfirmedAt";
  ELSIF NEW."firstConfirmedAt" IS NULL AND NEW."lastConfirmed" IS NOT NULL THEN
    NEW."firstConfirmedAt" := NEW."lastConfirmed";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER residency_first_confirmed
  BEFORE INSERT OR UPDATE ON "Residency"
  FOR EACH ROW EXECUTE FUNCTION residency_first_confirmed();

-- Backfill, conservatively: a night confirmed once last week starts its
-- three-month clock from last week. (The UPDATE fires the trigger, which does
-- exactly this; written out so the intent is on the page.)
UPDATE "Residency" SET "firstConfirmedAt" = "lastConfirmed" WHERE "lastConfirmed" IS NOT NULL AND "firstConfirmedAt" IS NULL;
