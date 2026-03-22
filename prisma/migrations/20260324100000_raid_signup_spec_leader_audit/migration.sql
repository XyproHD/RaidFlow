-- Anmeldung: gewählter Spec; Raidleitung: Reserve/Teilnehmer; Historie via Audit
ALTER TABLE "rf_raid_signup" ADD COLUMN IF NOT EXISTS "signed_spec" TEXT;
ALTER TABLE "rf_raid_signup" ADD COLUMN IF NOT EXISTS "leader_allows_reserve" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "rf_raid_signup" ADD COLUMN IF NOT EXISTS "leader_marked_teilnehmer" BOOLEAN NOT NULL DEFAULT false;

UPDATE "rf_raid_signup" s
SET "signed_spec" = c."main_spec"
FROM "rf_character" c
WHERE s."character_id" = c."id" AND (s."signed_spec" IS NULL OR s."signed_spec" = '');
