-- Performance indexes for high-frequency filters and joins.
CREATE INDEX IF NOT EXISTS "rf_user_guild_guild_id_idx" ON "rf_user_guild" ("guild_id");
CREATE INDEX IF NOT EXISTS "rf_guild_member_guild_id_idx" ON "rf_guild_member" ("guild_id");

CREATE INDEX IF NOT EXISTS "rf_character_user_id_idx" ON "rf_character" ("user_id");
CREATE INDEX IF NOT EXISTS "rf_character_guild_id_idx" ON "rf_character" ("guild_id");

CREATE INDEX IF NOT EXISTS "rf_raid_guild_id_scheduled_at_idx" ON "rf_raid" ("guild_id", "scheduled_at");
CREATE INDEX IF NOT EXISTS "rf_raid_scheduled_at_idx" ON "rf_raid" ("scheduled_at");
CREATE INDEX IF NOT EXISTS "rf_raid_raid_group_restriction_id_idx" ON "rf_raid" ("raid_group_restriction_id");

CREATE INDEX IF NOT EXISTS "rf_raid_signup_raid_id_idx" ON "rf_raid_signup" ("raid_id");
CREATE INDEX IF NOT EXISTS "rf_raid_signup_user_id_idx" ON "rf_raid_signup" ("user_id");
CREATE INDEX IF NOT EXISTS "rf_raid_signup_character_id_idx" ON "rf_raid_signup" ("character_id");

CREATE INDEX IF NOT EXISTS "rf_raid_completion_user_id_idx" ON "rf_raid_completion" ("user_id");
CREATE INDEX IF NOT EXISTS "rf_raid_completion_raid_id_idx" ON "rf_raid_completion" ("raid_id");
CREATE INDEX IF NOT EXISTS "rf_raid_completion_character_id_idx" ON "rf_raid_completion" ("character_id");

CREATE INDEX IF NOT EXISTS "rf_loot_user_id_received_at_idx" ON "rf_loot" ("user_id", "received_at" DESC);
CREATE INDEX IF NOT EXISTS "rf_loot_guild_id_idx" ON "rf_loot" ("guild_id");
CREATE INDEX IF NOT EXISTS "rf_loot_character_id_idx" ON "rf_loot" ("character_id");
