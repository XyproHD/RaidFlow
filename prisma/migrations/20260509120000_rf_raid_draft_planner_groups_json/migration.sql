-- Entwurf Planer (offener Raid): Reihenfolge Reserve + Gruppen, gleiche JSON-Struktur wie angekündigter Stand
ALTER TABLE "rf_raid" ADD COLUMN IF NOT EXISTS "draft_planner_groups_json" JSONB;
