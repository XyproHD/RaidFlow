-- AlterTable
ALTER TABLE "rf_raid" ADD COLUMN IF NOT EXISTS "allow_guests" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "rf_raid" ADD COLUMN IF NOT EXISTS "discord_guest_channel_id" TEXT;
