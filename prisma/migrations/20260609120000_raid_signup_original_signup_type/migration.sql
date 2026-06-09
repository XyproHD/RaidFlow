-- Selbstanmeldungs-Typ (unabhängig von Planer/Veröffentlichung).
ALTER TABLE rf_raid_signup
  ADD COLUMN IF NOT EXISTS original_signup_type TEXT;

UPDATE rf_raid_signup
SET original_signup_type = CASE WHEN type = 'main' THEN 'normal' ELSE type END
WHERE original_signup_type IS NULL;

ALTER TABLE rf_raid_signup
  ALTER COLUMN original_signup_type SET DEFAULT 'normal';

ALTER TABLE rf_raid_signup
  ALTER COLUMN original_signup_type SET NOT NULL;
