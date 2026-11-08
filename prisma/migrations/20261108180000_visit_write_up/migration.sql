-- The visit write-up: what comes back from the weekly attendance. Pure expand —
-- nullable or defaulted columns only, so it ships before the code that reads it.
--
--   Venue.conversationTestAt         when question 6 was last answered (any screen)
--   Venue.register / registerJudgedAt the JUDGED register, written only by a visit;
--                                     provisionalRegister stays the phone guess
--   Residency.clearsF2, Occurrence.clearsF2
--                                     Rule F2 per NIGHT. Venue.clearsF2 is dead on
--                                     every row and now unread; it is dropped in the
--                                     contract step, not here — code already deployed
--                                     still selects it.
--   Occurrence write-up fields        the prediction snapshot, the hours, what was
--                                     true against what the register said, the
--                                     sentence, and what the visit cost
-- AlterTable
ALTER TABLE "Occurrence" ADD COLUMN     "actualLineup" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "actualPrice" INTEGER,
ADD COLUMN     "actualStartTime" TEXT,
ADD COLUMN     "arrivedAt" TEXT,
ADD COLUMN     "clearsF2" BOOLEAN,
ADD COLUMN     "costEntry" INTEGER,
ADD COLUMN     "costSpend" INTEGER,
ADD COLUMN     "costTransport" INTEGER,
ADD COLUMN     "leftAt" TEXT,
ADD COLUMN     "mismatches" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "predictedFrom" "ConversationTest",
ADD COLUMN     "predictedRegister" "Register",
ADD COLUMN     "vettedNote" TEXT;

-- AlterTable
ALTER TABLE "Residency" ADD COLUMN     "clearsF2" BOOLEAN;

-- AlterTable
ALTER TABLE "Venue" ADD COLUMN     "conversationTestAt" TIMESTAMP(3),
ADD COLUMN     "register" "Register",
ADD COLUMN     "registerJudgedAt" TIMESTAMP(3);

