-- Parity fixes (Preview vs Prod drift via separate Supabase migration paths).
-- Safe to re-run: IF NOT EXISTS / OR REPLACE / conditional ALTER.

CREATE UNIQUE INDEX IF NOT EXISTS "rf_battlenet_api_config_region_key"
  ON "rf_battlenet_api_config" ("region");

CREATE UNIQUE INDEX IF NOT EXISTS "rf_raid_group_character_raid_group_id_character_id_key"
  ON "rf_raid_group_character" ("raid_group_id", "character_id");

CREATE INDEX IF NOT EXISTS "rf_dungeon_name_dungeon_id_idx"
  ON "rf_dungeon_name" ("dungeon_id");

CREATE INDEX IF NOT EXISTS "rf_dungeon_name_locale_idx"
  ON "rf_dungeon_name" ("locale");

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rf_battlenet_realm_set_updated_at ON public.rf_battlenet_realm;
CREATE TRIGGER rf_battlenet_realm_set_updated_at
  BEFORE UPDATE ON public.rf_battlenet_realm
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Prod had timestamptz; Prisma/Preview use timestamp(3) without time zone.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'rf_user_guild'
      AND column_name = 'last_active_at'
      AND udt_name = 'timestamptz'
  ) THEN
    ALTER TABLE public.rf_user_guild
      ALTER COLUMN last_active_at TYPE timestamp(3) WITHOUT TIME ZONE
      USING (
        CASE
          WHEN last_active_at IS NULL THEN NULL
          ELSE last_active_at AT TIME ZONE 'UTC'
        END
      );
  END IF;
END $$;

-- Redundant second composite unique on Battle.net character profile (if present).
DROP INDEX IF EXISTS "rf_battlenet_character_profile_region_realm_slug_character__key";
