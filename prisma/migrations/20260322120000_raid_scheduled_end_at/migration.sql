-- Optionales Ende des Raid-Zeitfensters (Start/Ende Slot-Auswahl im Planer)
ALTER TABLE "rf_raid" ADD COLUMN IF NOT EXISTS "scheduled_end_at" TIMESTAMPTZ;
