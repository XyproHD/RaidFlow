-- Prisma upsert on rf_battlenet_character_profile uses ON CONFLICT ("character_id").
-- Postgres 42P10 if these unique indexes are missing (e.g. Prod table from Supabase
-- sync without the indexes from prisma/migrations/20260320_battlenet_character_profile).
CREATE UNIQUE INDEX IF NOT EXISTS "rf_battlenet_character_profile_character_id_key"
  ON "rf_battlenet_character_profile" ("character_id");

CREATE UNIQUE INDEX IF NOT EXISTS "rf_bnet_profile_lookup_key"
  ON "rf_battlenet_character_profile" ("region", "realm_slug", "character_name_lower");
