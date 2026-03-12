-- CreateTable: Mitglieder können mehreren Raidgruppen zugeordnet sein (idempotent)
CREATE TABLE IF NOT EXISTS "rf_guild_member_raid_group" (
    "guild_member_id" TEXT NOT NULL,
    "raid_group_id" TEXT NOT NULL,

    CONSTRAINT "rf_guild_member_raid_group_pkey" PRIMARY KEY ("guild_member_id","raid_group_id")
);

-- Bestehende Zuordnung übernehmen (ein Member = eine Gruppe); nur wenn Spalte raid_group_id noch existiert
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rf_guild_member' AND column_name = 'raid_group_id') THEN
    INSERT INTO "rf_guild_member_raid_group" ("guild_member_id", "raid_group_id")
    SELECT "id", "raid_group_id" FROM "rf_guild_member" WHERE "raid_group_id" IS NOT NULL
    ON CONFLICT ("guild_member_id", "raid_group_id") DO NOTHING;
  END IF;
END $$;

-- DropForeignKey (raid_group_id auf rf_guild_member)
ALTER TABLE "rf_guild_member" DROP CONSTRAINT IF EXISTS "rf_guild_member_raid_group_id_fkey";

-- AlterTable: Spalte raid_group_id entfernen (nur wenn vorhanden)
ALTER TABLE "rf_guild_member" DROP COLUMN IF EXISTS "raid_group_id";

-- AddForeignKey (nur wenn noch nicht vorhanden)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rf_guild_member_raid_group_guild_member_id_fkey') THEN
    ALTER TABLE "rf_guild_member_raid_group" ADD CONSTRAINT "rf_guild_member_raid_group_guild_member_id_fkey" FOREIGN KEY ("guild_member_id") REFERENCES "rf_guild_member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rf_guild_member_raid_group_raid_group_id_fkey') THEN
    ALTER TABLE "rf_guild_member_raid_group" ADD CONSTRAINT "rf_guild_member_raid_group_raid_group_id_fkey" FOREIGN KEY ("raid_group_id") REFERENCES "rf_raid_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
