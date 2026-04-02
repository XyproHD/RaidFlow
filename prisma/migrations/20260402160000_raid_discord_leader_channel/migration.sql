-- Optional: Discord-Kanal für Raidleader (gespeichert für spätere Nutzung)
ALTER TABLE "rf_raid" ADD COLUMN IF NOT EXISTS "discord_leader_channel_id" TEXT;
