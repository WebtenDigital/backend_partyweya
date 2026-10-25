-- The round-up brief.
--
-- Publication: an entry is a dated row OR a standing night on a date. A
-- standing night has no Occurrence row, and publishing must never create one
-- (that would edit the register), so a publication can point at the residency
-- plus the night's date instead. It also keeps the line written about the
-- night and its slide position. Still a table: an entry that travels twice
-- has two rows. Empty until now, so nothing to backfill.

ALTER TABLE "Publication" DROP CONSTRAINT "Publication_occurrenceId_fkey";
ALTER TABLE "Publication" ALTER COLUMN "occurrenceId" DROP NOT NULL,
ADD COLUMN "residencyId" TEXT,
ADD COLUMN "nightDate" DATE NOT NULL,
ADD COLUMN "position" INTEGER,
ADD COLUMN "line" TEXT;

-- A published night can't be deleted out from under its record.
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "Occurrence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_residencyId_fkey" FOREIGN KEY ("residencyId") REFERENCES "Residency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Publication_occurrenceId_idx" ON "Publication"("occurrenceId");
CREATE INDEX "Publication_residencyId_idx" ON "Publication"("residencyId");

ALTER TABLE "Publication" ADD CONSTRAINT "publication_one_entry"
  CHECK (num_nonnulls("occurrenceId", "residencyId") = 1);

-- The working draft for a week's round-up: order, lines, caption, TikTok cut.
-- Building is not publishing; nothing here is a Publication.
CREATE TABLE "Roundup" (
    "week" DATE NOT NULL,
    "intro" TEXT NOT NULL DEFAULT '',
    "pointer" TEXT NOT NULL DEFAULT '',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tiktok" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Roundup_pkey" PRIMARY KEY ("week")
);

CREATE TABLE "RoundupEntry" (
    "week" DATE NOT NULL,
    "key" TEXT NOT NULL,
    "line" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL,

    CONSTRAINT "RoundupEntry_pkey" PRIMARY KEY ("week","key")
);

ALTER TABLE "RoundupEntry" ADD CONSTRAINT "RoundupEntry_week_fkey" FOREIGN KEY ("week") REFERENCES "Roundup"("week") ON DELETE CASCADE ON UPDATE CASCADE;

-- Internal like the rest of the register: RLS on, no grants.
ALTER TABLE "Roundup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RoundupEntry" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "Roundup", "RoundupEntry" FROM anon, authenticated;
