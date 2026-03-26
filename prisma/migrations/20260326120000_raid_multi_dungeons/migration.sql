-- Add optional list of dungeon IDs for multi-select raids.
-- Keep existing dungeon_id as primary/compatibility reference.

ALTER TABLE "rf_raid"
ADD COLUMN IF NOT EXISTS "dungeon_ids" jsonb;

