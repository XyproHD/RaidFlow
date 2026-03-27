-- Battle.net Realm aus Gilden-Profil-API (Slug + realm.id) auf rf_guild

ALTER TABLE "public"."rf_guild"
  ADD COLUMN IF NOT EXISTS "battlenet_profile_realm_slug" TEXT,
  ADD COLUMN IF NOT EXISTS "battlenet_profile_realm_id" BIGINT;
