-- Battle.net Character-Metadaten je RaidFlow-Charakter.
-- Speichert API-Daten für spätere Synchronisationen.

CREATE TABLE IF NOT EXISTS "rf_battlenet_character_profile" (
  "id" TEXT NOT NULL,
  "character_id" TEXT NOT NULL,
  "battlenet_config_id" TEXT,
  "region" TEXT NOT NULL,
  "realm_slug" TEXT NOT NULL,
  "realm_name" TEXT,
  "character_name_lower" TEXT NOT NULL,
  "battlenet_character_id" BIGINT,
  "level" INTEGER,
  "race_name" TEXT,
  "class_name" TEXT,
  "active_spec_name" TEXT,
  "guild_name" TEXT,
  "faction" TEXT,
  "profile_url" TEXT,
  "raw_profile" JSONB,
  "last_synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "rf_battlenet_character_profile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "rf_battlenet_character_profile_character_id_fkey"
    FOREIGN KEY ("character_id") REFERENCES "rf_character"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "rf_battlenet_character_profile_battlenet_config_id_fkey"
    FOREIGN KEY ("battlenet_config_id") REFERENCES "rf_battlenet_api_config"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "rf_battlenet_character_profile_character_id_key"
  ON "rf_battlenet_character_profile"("character_id");
CREATE UNIQUE INDEX IF NOT EXISTS "rf_bnet_profile_lookup_key"
  ON "rf_battlenet_character_profile"("region", "realm_slug", "character_name_lower");

ALTER TABLE public.rf_battlenet_character_profile ENABLE ROW LEVEL SECURITY;
