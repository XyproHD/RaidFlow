-- Idempotent: Preview/Prod kann Spalte bereits per Supabase/Repair haben; migrate deploy muss nicht scheitern.
ALTER TABLE "rf_character"
ADD COLUMN IF NOT EXISTS "gear_score" INTEGER;
