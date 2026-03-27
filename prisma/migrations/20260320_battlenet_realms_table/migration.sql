-- Battle.net Realm Index (fixed server list)

CREATE TABLE IF NOT EXISTS "rf_battlenet_realm" (
  "id" TEXT NOT NULL,
  "region" TEXT NOT NULL,
  "wow_version" TEXT NOT NULL,
  "realm_slug" TEXT NOT NULL,
  "realm_name" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "rf_battlenet_realm_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "rf_battlenet_realm_region_wow_version_realm_slug_key"
  ON "rf_battlenet_realm"("region", "wow_version", "realm_slug");

ALTER TABLE public.rf_battlenet_realm ENABLE ROW LEVEL SECURITY;

