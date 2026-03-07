-- =============================================================================
-- RaidFlow – Datenbank-Reset (Supabase/PostgreSQL)
-- =============================================================================
-- Entfernt alle Tabellen, Views und Prisma-Migrationen, damit das Projekt
-- von Grund auf neu aufgesetzt werden kann.
-- Ausführung: Supabase Dashboard → SQL Editor → dieses Skript einfügen & ausführen
--             ODER: psql "$DIRECT_URL" -f scripts/db-reset.sql
-- =============================================================================

-- Deaktiviert FK-Checks während des Drops (nicht nötig bei CASCADE)
SET client_min_messages TO WARNING;

-- 1) Views entfernen (falls vorhanden)
DROP VIEW IF EXISTS "RaidParticipationStats" CASCADE;
DROP VIEW IF EXISTS raid_participation_stats CASCADE;
DROP VIEW IF EXISTS rf_raid_participation_stats CASCADE;

-- 2) Weitere evtl. vorhandene App-Tabellen (historisch)
DROP TABLE IF EXISTS "DefaultAvailability" CASCADE;
DROP TABLE IF EXISTS default_availability CASCADE;
DROP TABLE IF EXISTS "GuildMembership" CASCADE;
DROP TABLE IF EXISTS guild_membership CASCADE;
DROP TABLE IF EXISTS "RaidParticipation" CASCADE;
DROP TABLE IF EXISTS raid_participation CASCADE;

-- 3) RaidFlow-Tabellen (rf_*) – Standard-Namensraum der App
DROP TABLE IF EXISTS rf_loot CASCADE;
DROP TABLE IF EXISTS rf_raid_completion CASCADE;
DROP TABLE IF EXISTS rf_raid_signup CASCADE;
DROP TABLE IF EXISTS rf_raid CASCADE;
DROP TABLE IF EXISTS rf_guild_allowed_channel CASCADE;
DROP TABLE IF EXISTS rf_guild_member CASCADE;
DROP TABLE IF EXISTS rf_raid_group CASCADE;
DROP TABLE IF EXISTS rf_character CASCADE;
DROP TABLE IF EXISTS rf_raid_time_preference CASCADE;
DROP TABLE IF EXISTS rf_user_guild CASCADE;
DROP TABLE IF EXISTS rf_dungeon CASCADE;
DROP TABLE IF EXISTS rf_guild CASCADE;
DROP TABLE IF EXISTS rf_user CASCADE;
DROP TABLE IF EXISTS rf_app_admin CASCADE;
DROP TABLE IF EXISTS rf_app_config CASCADE;
DROP TABLE IF EXISTS rf_raid_min_spec CASCADE;
DROP TABLE IF EXISTS rf_audit_log CASCADE;

-- 4) Alte/alternative Tabellennamen (falls jemals ohne rf_-Prefix angelegt)
DROP TABLE IF EXISTS "Loot" CASCADE;
DROP TABLE IF EXISTS loot CASCADE;
DROP TABLE IF EXISTS "RaidCompletion" CASCADE;
DROP TABLE IF EXISTS raid_completion CASCADE;
DROP TABLE IF EXISTS "RaidSignup" CASCADE;
DROP TABLE IF EXISTS raid_signup CASCADE;
DROP TABLE IF EXISTS "Raid" CASCADE;
DROP TABLE IF EXISTS raid CASCADE;
DROP TABLE IF EXISTS "GuildAllowedChannel" CASCADE;
DROP TABLE IF EXISTS guild_allowed_channel CASCADE;
DROP TABLE IF EXISTS "GuildMember" CASCADE;
DROP TABLE IF EXISTS guild_member CASCADE;
DROP TABLE IF EXISTS "RaidGroup" CASCADE;
DROP TABLE IF EXISTS raid_group CASCADE;
DROP TABLE IF EXISTS "Character" CASCADE;
DROP TABLE IF EXISTS character CASCADE;
DROP TABLE IF EXISTS "RaidTimePreference" CASCADE;
DROP TABLE IF EXISTS raid_time_preference CASCADE;
DROP TABLE IF EXISTS "UserGuild" CASCADE;
DROP TABLE IF EXISTS user_guild CASCADE;
DROP TABLE IF EXISTS "Dungeon" CASCADE;
DROP TABLE IF EXISTS dungeon CASCADE;
DROP TABLE IF EXISTS "Guild" CASCADE;
DROP TABLE IF EXISTS guild CASCADE;
DROP TABLE IF EXISTS "User" CASCADE;
DROP TABLE IF EXISTS "user" CASCADE;
DROP TABLE IF EXISTS "AppAdmin" CASCADE;
DROP TABLE IF EXISTS app_admin CASCADE;
DROP TABLE IF EXISTS "AppConfig" CASCADE;
DROP TABLE IF EXISTS app_config CASCADE;
DROP TABLE IF EXISTS "RaidMinSpec" CASCADE;
DROP TABLE IF EXISTS raid_min_spec CASCADE;

-- 5) Prisma-Migrationstabelle (falls Prisma jemals genutzt wurde)
DROP TABLE IF EXISTS "_prisma_migrations" CASCADE;

-- Optional: Alle anderen Tabellen im public-Schema droppen (Vorsicht: löscht wirklich alles)
-- Nur auskommentiert verwenden, wenn du wirklich den kompletten public-Schema leeren willst:
/*
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
    EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
  END LOOP;
END $$;
*/

RESET client_min_messages;
