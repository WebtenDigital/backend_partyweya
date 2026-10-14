-- CreateEnum
CREATE TYPE "Register" AS ENUM ('CHILL', 'SOCIAL', 'HIGH_ENERGY');

-- CreateEnum
CREATE TYPE "ClaimType" AS ENUM ('VETTED', 'TRANSFERRED', 'FACTUAL');

-- CreateEnum
CREATE TYPE "OccurrenceStatus" AS ENUM ('LEAD', 'CONFIRMED', 'CHANGED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Category" AS ENUM ('LIVE_BAND', 'DJ', 'KARAOKE', 'QUIZ', 'ACOUSTIC', 'POETRY', 'COMEDY', 'BRUNCH', 'PAGEANT', 'CONCERT', 'OTHER');

-- CreateEnum
CREATE TYPE "ConversationTest" AS ENUM ('CAN_TALK', 'ONLY_AT_THE_EDGES', 'NO');

-- CreateEnum
CREATE TYPE "ContactRole" AS ENUM ('MANAGER', 'MARKETING', 'PROMOTER', 'OWNER', 'HOST');

-- CreateEnum
CREATE TYPE "Recurrence" AS ENUM ('WEEKLY', 'MONTHLY', 'SEASONAL');

-- CreateEnum
CREATE TYPE "PostType" AS ENUM ('ROUND_UP', 'CAROUSEL_CUT', 'MOOD_MENU', 'MID_WEEK', 'LAST_MINUTE', 'DISCOVERY', 'ZONE_ZOOM_IN', 'MOOD_PICK', 'HIGHLIGHT', 'STORY');

-- CreateTable
CREATE TABLE "Venue" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "contactName" TEXT,
    "contactRole" "ContactRole",
    "phone" TEXT,
    "whatsapp" BOOLEAN NOT NULL DEFAULT false,
    "bestTimeToReach" TEXT,
    "conversationTest" "ConversationTest",
    "provisionalRegister" "Register",
    "lastAttended" TIMESTAMP(3),
    "clearsF2" BOOLEAN,
    "paidClient" BOOLEAN NOT NULL DEFAULT false,
    "lastContacted" TIMESTAMP(3),
    "nextContactDue" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Residency" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "category" "Category" NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT,
    "costGate" INTEGER,
    "costAdvance" INTEGER,
    "register" "Register" NOT NULL,
    "recurrence" "Recurrence" NOT NULL DEFAULT 'WEEKLY',
    "runningSince" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastConfirmed" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Residency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Occurrence" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "venueId" TEXT NOT NULL,
    "residencyId" TEXT,
    "eventName" TEXT NOT NULL,
    "category" "Category" NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "costGate" INTEGER,
    "costAdvance" INTEGER,
    "lineup" TEXT,
    "register" "Register",
    "claimType" "ClaimType",
    "source" TEXT,
    "status" "OccurrenceStatus" NOT NULL DEFAULT 'LEAD',
    "confirmedOn" TIMESTAMP(3),
    "confirmedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Occurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Publication" (
    "id" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "postType" "PostType" NOT NULL,
    "platform" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "postUrl" TEXT,

    CONSTRAINT "Publication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Venue_name_key" ON "Venue"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Venue_slug_key" ON "Venue"("slug");

-- CreateIndex
CREATE INDEX "Venue_zone_idx" ON "Venue"("zone");

-- CreateIndex
CREATE INDEX "Residency_dayOfWeek_active_idx" ON "Residency"("dayOfWeek", "active");

-- CreateIndex
CREATE INDEX "Occurrence_date_status_idx" ON "Occurrence"("date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Occurrence_venueId_date_eventName_key" ON "Occurrence"("venueId", "date", "eventName");

-- CreateIndex
CREATE INDEX "Publication_postedAt_idx" ON "Publication"("postedAt");

-- CreateIndex
CREATE INDEX "Publication_postType_idx" ON "Publication"("postType");

-- AddForeignKey
ALTER TABLE "Residency" ADD CONSTRAINT "Residency_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Occurrence" ADD CONSTRAINT "Occurrence_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Occurrence" ADD CONSTRAINT "Occurrence_residencyId_fkey" FOREIGN KEY ("residencyId") REFERENCES "Residency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "Occurrence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
