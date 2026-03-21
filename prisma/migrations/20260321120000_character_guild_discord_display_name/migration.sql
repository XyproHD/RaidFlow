-- Cached Discord display name on the guild's Discord server (per character row; updated on login / guild sync).
ALTER TABLE "rf_character" ADD COLUMN "guild_discord_display_name" TEXT;
