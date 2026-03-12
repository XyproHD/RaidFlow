-- CreateTable: Mitglieder können mehreren Raidgruppen zugeordnet sein
CREATE TABLE "rf_guild_member_raid_group" (
    "guild_member_id" TEXT NOT NULL,
    "raid_group_id" TEXT NOT NULL,

    CONSTRAINT "rf_guild_member_raid_group_pkey" PRIMARY KEY ("guild_member_id","raid_group_id")
);

-- Bestehende Zuordnung übernehmen (ein Member = eine Gruppe)
INSERT INTO "rf_guild_member_raid_group" ("guild_member_id", "raid_group_id")
SELECT "id", "raid_group_id" FROM "rf_guild_member" WHERE "raid_group_id" IS NOT NULL;

-- DropForeignKey (raid_group_id auf rf_guild_member)
ALTER TABLE "rf_guild_member" DROP CONSTRAINT IF EXISTS "rf_guild_member_raid_group_id_fkey";

-- AlterTable: Spalte raid_group_id entfernen
ALTER TABLE "rf_guild_member" DROP COLUMN "raid_group_id";

-- AddForeignKey
ALTER TABLE "rf_guild_member_raid_group" ADD CONSTRAINT "rf_guild_member_raid_group_guild_member_id_fkey" FOREIGN KEY ("guild_member_id") REFERENCES "rf_guild_member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rf_guild_member_raid_group" ADD CONSTRAINT "rf_guild_member_raid_group_raid_group_id_fkey" FOREIGN KEY ("raid_group_id") REFERENCES "rf_raid_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
