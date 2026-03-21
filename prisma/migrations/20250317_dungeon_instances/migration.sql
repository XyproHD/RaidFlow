-- RaidFlow: Dungeon/Instanz erweitern (Typ, Spieleranzahl, Reset, Addons, Mehrsprachigkeit)
-- Nutzung: Raidplaner wählt Instanzen; Namen je Sprache; Reset für ID-Reset-Anzeige.

-- 1) rf_dungeon erweitern
ALTER TABLE "rf_dungeon"
  ADD COLUMN IF NOT EXISTS "instance_type" TEXT NOT NULL DEFAULT 'raid',
  ADD COLUMN IF NOT EXISTS "max_players" INTEGER NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS "reset_type" TEXT,
  ADD COLUMN IF NOT EXISTS "reset_weekday" INTEGER,
  ADD COLUMN IF NOT EXISTS "reset_time_utc" TEXT,
  ADD COLUMN IF NOT EXISTS "addon_names" JSONB DEFAULT '[]';

COMMENT ON COLUMN "rf_dungeon"."instance_type" IS 'dungeon = 5er, raid = Schlachtzug (10/25)';
COMMENT ON COLUMN "rf_dungeon"."max_players" IS '5 = Dungeon, 10 oder 25 = Raid';
COMMENT ON COLUMN "rf_dungeon"."reset_type" IS 'weekly | daily | per_run';
COMMENT ON COLUMN "rf_dungeon"."reset_weekday" IS '0=Sonntag .. 6=Samstag (für weekly/daily)';
COMMENT ON COLUMN "rf_dungeon"."reset_time_utc" IS 'HH:MM UTC, z.B. 04:00';
COMMENT ON COLUMN "rf_dungeon"."addon_names" IS 'Addons in denen die Instanz vorkommt, z.B. ["AtlasLoot","InstanceID"]';

-- 2) Mehrsprachige Namen
CREATE TABLE IF NOT EXISTS "rf_dungeon_name" (
  "dungeon_id" TEXT NOT NULL,
  "locale" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  CONSTRAINT "rf_dungeon_name_pkey" PRIMARY KEY ("dungeon_id", "locale"),
  CONSTRAINT "rf_dungeon_name_dungeon_id_fkey" FOREIGN KEY ("dungeon_id") REFERENCES "rf_dungeon"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "rf_dungeon_name_dungeon_id_idx" ON "rf_dungeon_name"("dungeon_id");
CREATE INDEX IF NOT EXISTS "rf_dungeon_name_locale_idx" ON "rf_dungeon_name"("locale");

COMMENT ON TABLE "rf_dungeon_name" IS 'Lokalisierte Instanznamen (de, en, fr, …); rf_dungeon.name = Fallback/Default (z.B. en)';
