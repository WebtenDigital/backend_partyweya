-- "No offers" as an answer. Pure expand: when the offers question was last
-- answered, nothing included — so NOT ASKED YET stops re-asking a "no".
ALTER TABLE "Residency" ADD COLUMN "offersAskedAt" TIMESTAMP(3);
ALTER TABLE "Occurrence" ADD COLUMN "offersAskedAt" TIMESTAMP(3);
