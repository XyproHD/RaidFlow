-- Phase 7: Verspätungs-Flag, Thread-Zusammenfassungs-Message-ID, Typ main → normal
ALTER TABLE "rf_raid" ADD COLUMN IF NOT EXISTS "discord_thread_summary_message_id" TEXT;

ALTER TABLE "rf_raid_signup" ADD COLUMN IF NOT EXISTS "is_late" BOOLEAN NOT NULL DEFAULT false;

UPDATE "rf_raid_signup" SET "type" = 'normal' WHERE "type" = 'main';
