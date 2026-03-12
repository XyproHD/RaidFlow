-- CreateTable
CREATE TABLE "rf_raid_group_character" (
    "id" TEXT NOT NULL,
    "raid_group_id" TEXT NOT NULL,
    "character_id" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "rf_raid_group_character_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rf_raid_group_character_raid_group_id_character_id_key" ON "rf_raid_group_character"("raid_group_id", "character_id");

-- AddForeignKey
ALTER TABLE "rf_raid_group_character" ADD CONSTRAINT "rf_raid_group_character_raid_group_id_fkey" FOREIGN KEY ("raid_group_id") REFERENCES "rf_raid_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rf_raid_group_character" ADD CONSTRAINT "rf_raid_group_character_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "rf_character"("id") ON DELETE CASCADE ON UPDATE CASCADE;
