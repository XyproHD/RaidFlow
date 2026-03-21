-- Battle.net WoW realm + guild id for Discord guilds (guild master settings)

ALTER TABLE "public"."rf_guild"
  ADD COLUMN IF NOT EXISTS "battlenet_realm_id" TEXT,
  ADD COLUMN IF NOT EXISTS "battlenet_guild_id" BIGINT,
  ADD COLUMN IF NOT EXISTS "battlenet_guild_name" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rf_guild_battlenet_realm_id_fkey'
  ) THEN
    ALTER TABLE "public"."rf_guild"
      ADD CONSTRAINT "rf_guild_battlenet_realm_id_fkey"
      FOREIGN KEY ("battlenet_realm_id") REFERENCES "public"."rf_battlenet_realm"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
