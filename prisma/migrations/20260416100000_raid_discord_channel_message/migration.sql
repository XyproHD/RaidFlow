-- Migration: discord_channel_message_id zu rf_raid
-- Speichert die ID der Embed-Nachricht im Channel (für PATCH bei Updates)
ALTER TABLE "rf_raid" ADD COLUMN IF NOT EXISTS "discord_channel_message_id" TEXT;
