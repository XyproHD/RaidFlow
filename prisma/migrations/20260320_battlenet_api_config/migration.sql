-- Battle.net API Konfiguration für WoW Classic Charakter- und Gildensuche.
-- Enthält Endpunkte/Namespaces + Zugangsdaten pro Region.

CREATE TABLE IF NOT EXISTS "rf_battlenet_api_config" (
  "id" TEXT NOT NULL,
  "region" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "client_secret" TEXT NOT NULL,
  "locale" TEXT NOT NULL DEFAULT 'de_DE',
  "namespace_profile" TEXT NOT NULL,
  "namespace_dynamic" TEXT NOT NULL,
  "oauth_token_url" TEXT NOT NULL,
  "api_base_url" TEXT NOT NULL,
  "search_character_path" TEXT NOT NULL DEFAULT '/data/wow/search/character',
  "search_guild_path" TEXT NOT NULL DEFAULT '/data/wow/search/guild',
  "profile_character_path" TEXT NOT NULL DEFAULT '/profile/wow/character',
  "profile_guild_path" TEXT NOT NULL DEFAULT '/data/wow/guild',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "rf_battlenet_api_config_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "rf_battlenet_api_config_region_key"
  ON "rf_battlenet_api_config"("region");

COMMENT ON TABLE "rf_battlenet_api_config" IS
  'Battle.net API Konfiguration je Region (OAuth, Base-URL, Namespaces, Endpunkte).';

ALTER TABLE public.rf_battlenet_api_config ENABLE ROW LEVEL SECURITY;
