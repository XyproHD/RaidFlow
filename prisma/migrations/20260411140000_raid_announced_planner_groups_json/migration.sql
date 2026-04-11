-- Persisted multi-group planner layout when a raid is announced (public roster + dashboard group count).
ALTER TABLE "rf_raid" ADD COLUMN IF NOT EXISTS "announced_planner_groups_json" JSONB;
