-- Phase 8: Spalten Gesetzt / Ersatz / Anmeldung
ALTER TABLE "rf_raid_signup" ADD COLUMN "leader_placement" TEXT NOT NULL DEFAULT 'signup';

UPDATE "rf_raid_signup" SET "leader_placement" = 'confirmed' WHERE "set_confirmed" = true;
