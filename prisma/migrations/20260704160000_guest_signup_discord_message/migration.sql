-- AlterTable
ALTER TABLE "rf_raid" ADD COLUMN IF NOT EXISTS "discord_guest_channel_message_id" TEXT;

-- AlterTable
ALTER TABLE "rf_raid_signup" ADD COLUMN IF NOT EXISTS "is_guest" BOOLEAN NOT NULL DEFAULT false;
