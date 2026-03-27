-- Enable RLS on public tables (Supabase PostgREST). Prisma/table owner bypasses RLS.
-- anon/authenticated: no policies => no row access via Data API (server-only app).

ALTER TABLE public.rf_raid_group_character ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._prisma_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rf_app_admin ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rf_app_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rf_character ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rf_guild ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rf_raid_group ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rf_guild_member ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rf_raid_time_preference ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rf_raid ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rf_raid_signup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rf_raid_completion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rf_loot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rf_guild_allowed_channel ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rf_user ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rf_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rf_guild_member_raid_group ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rf_user_guild ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rf_dungeon_name ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rf_dungeon ENABLE ROW LEVEL SECURITY;
