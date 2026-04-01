-- AlterTable
ALTER TABLE "rf_raid_signup" ADD COLUMN "punctuality" TEXT NOT NULL DEFAULT 'on_time';

UPDATE "rf_raid_signup" SET "punctuality" = CASE WHEN "is_late" THEN 'late' ELSE 'on_time' END;
