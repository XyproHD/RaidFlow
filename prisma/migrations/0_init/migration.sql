-- CreateTable
CREATE TABLE "rf_user" (
    "id" TEXT NOT NULL,
    "discord_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rf_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rf_guild" (
    "id" TEXT NOT NULL,
    "discord_guild_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bot_invite_status" TEXT,
    "discord_role_guildmaster_id" TEXT,
    "discord_role_raidleader_id" TEXT,
    "discord_role_raider_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rf_guild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rf_user_guild" (
    "user_id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rf_user_guild_pkey" PRIMARY KEY ("user_id","guild_id")
);

-- CreateTable
CREATE TABLE "rf_raid_group" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "discord_role_id" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "rf_raid_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rf_guild_member" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "raid_group_id" TEXT,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rf_guild_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rf_character" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "guild_id" TEXT,
    "name" TEXT NOT NULL,
    "main_spec" TEXT NOT NULL,
    "off_spec" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rf_character_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rf_raid_time_preference" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "weekday" TEXT NOT NULL,
    "time_slot" TEXT NOT NULL,
    "preference" TEXT NOT NULL,
    "week_focus" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rf_raid_time_preference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rf_dungeon" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "expansion" TEXT NOT NULL,

    CONSTRAINT "rf_dungeon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rf_raid" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "dungeon_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "raid_leader_id" TEXT,
    "lootmaster_id" TEXT,
    "min_tanks" INTEGER NOT NULL,
    "min_melee" INTEGER NOT NULL,
    "min_range" INTEGER NOT NULL,
    "min_healers" INTEGER NOT NULL,
    "min_specs" JSONB,
    "raid_group_restriction_id" TEXT,
    "note" TEXT,
    "max_players" INTEGER NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "signup_until" TIMESTAMP(3) NOT NULL,
    "signup_visibility" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "discord_thread_id" TEXT,
    "discord_channel_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rf_raid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rf_raid_signup" (
    "id" TEXT NOT NULL,
    "raid_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "character_id" TEXT,
    "type" TEXT NOT NULL,
    "allow_reserve" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "set_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "signed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rf_raid_signup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rf_raid_completion" (
    "id" TEXT NOT NULL,
    "raid_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "character_id" TEXT,
    "participation_counter" DECIMAL(3,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rf_raid_completion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rf_loot" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "dungeon_id" TEXT NOT NULL,
    "character_id" TEXT,
    "item_ref" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rf_loot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rf_guild_allowed_channel" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "discord_channel_id" TEXT NOT NULL,
    "name" TEXT,
    "last_validated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rf_guild_allowed_channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rf_app_admin" (
    "id" TEXT NOT NULL,
    "discord_user_id" TEXT NOT NULL,
    "added_by_discord_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rf_app_admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rf_app_config" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "rf_app_config_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "rf_audit_log" (
    "id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "changed_by_user_id" TEXT NOT NULL,
    "field_name" TEXT,
    "old_value" TEXT,
    "new_value" TEXT,
    "guild_id" TEXT,
    "raid_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rf_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rf_user_discord_id_key" ON "rf_user"("discord_id");

-- CreateIndex
CREATE UNIQUE INDEX "rf_guild_discord_guild_id_key" ON "rf_guild"("discord_guild_id");

-- CreateIndex
CREATE UNIQUE INDEX "rf_guild_member_user_id_guild_id_key" ON "rf_guild_member"("user_id", "guild_id");

-- CreateIndex
CREATE UNIQUE INDEX "rf_app_admin_discord_user_id_key" ON "rf_app_admin"("discord_user_id");

-- AddForeignKey
ALTER TABLE "rf_user_guild" ADD CONSTRAINT "rf_user_guild_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "rf_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rf_user_guild" ADD CONSTRAINT "rf_user_guild_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "rf_guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rf_raid_group" ADD CONSTRAINT "rf_raid_group_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "rf_guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rf_guild_member" ADD CONSTRAINT "rf_guild_member_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "rf_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rf_guild_member" ADD CONSTRAINT "rf_guild_member_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "rf_guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rf_guild_member" ADD CONSTRAINT "rf_guild_member_raid_group_id_fkey" FOREIGN KEY ("raid_group_id") REFERENCES "rf_raid_group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rf_character" ADD CONSTRAINT "rf_character_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "rf_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rf_character" ADD CONSTRAINT "rf_character_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "rf_guild"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rf_raid_time_preference" ADD CONSTRAINT "rf_raid_time_preference_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "rf_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rf_raid" ADD CONSTRAINT "rf_raid_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "rf_guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rf_raid" ADD CONSTRAINT "rf_raid_dungeon_id_fkey" FOREIGN KEY ("dungeon_id") REFERENCES "rf_dungeon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rf_raid" ADD CONSTRAINT "rf_raid_raid_group_restriction_id_fkey" FOREIGN KEY ("raid_group_restriction_id") REFERENCES "rf_raid_group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rf_raid_signup" ADD CONSTRAINT "rf_raid_signup_raid_id_fkey" FOREIGN KEY ("raid_id") REFERENCES "rf_raid"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rf_raid_signup" ADD CONSTRAINT "rf_raid_signup_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "rf_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rf_raid_signup" ADD CONSTRAINT "rf_raid_signup_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "rf_character"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rf_raid_completion" ADD CONSTRAINT "rf_raid_completion_raid_id_fkey" FOREIGN KEY ("raid_id") REFERENCES "rf_raid"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rf_raid_completion" ADD CONSTRAINT "rf_raid_completion_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "rf_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rf_raid_completion" ADD CONSTRAINT "rf_raid_completion_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "rf_character"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rf_loot" ADD CONSTRAINT "rf_loot_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "rf_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rf_loot" ADD CONSTRAINT "rf_loot_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "rf_guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rf_loot" ADD CONSTRAINT "rf_loot_dungeon_id_fkey" FOREIGN KEY ("dungeon_id") REFERENCES "rf_dungeon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rf_loot" ADD CONSTRAINT "rf_loot_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "rf_character"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rf_guild_allowed_channel" ADD CONSTRAINT "rf_guild_allowed_channel_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "rf_guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rf_audit_log" ADD CONSTRAINT "rf_audit_log_changed_by_user_id_fkey" FOREIGN KEY ("changed_by_user_id") REFERENCES "rf_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rf_audit_log" ADD CONSTRAINT "rf_audit_log_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "rf_guild"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rf_audit_log" ADD CONSTRAINT "rf_audit_log_raid_id_fkey" FOREIGN KEY ("raid_id") REFERENCES "rf_raid"("id") ON DELETE SET NULL ON UPDATE CASCADE;

