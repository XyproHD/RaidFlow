ALTER TABLE "rf_raid_signup"
ADD COLUMN "only_signed_spec" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "forbid_reserve" BOOLEAN NOT NULL DEFAULT false;

UPDATE "rf_raid_signup"
SET "leader_allows_reserve" = false
WHERE "forbid_reserve" = true;
