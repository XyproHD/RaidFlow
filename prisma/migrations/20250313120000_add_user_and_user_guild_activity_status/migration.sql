-- rf_user: letzte RaidFlow-Aktivität und Status (aktiv, inaktiv, deaktiviert)
ALTER TABLE rf_user
  ADD COLUMN IF NOT EXISTS last_active_at timestamptz,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'aktiv';

-- Status nur erlaubte Werte (ignorieren wenn Constraint bereits existiert)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rf_user_status_check'
  ) THEN
    ALTER TABLE rf_user ADD CONSTRAINT rf_user_status_check
      CHECK (status IN ('aktiv', 'inaktiv', 'deaktiviert'));
  END IF;
END $$;

-- rf_user_guild: letzte Aktivität in dieser Gilde und Status je Gilde
ALTER TABLE rf_user_guild
  ADD COLUMN IF NOT EXISTS last_active_at timestamptz,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'aktiv';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rf_user_guild_status_check'
  ) THEN
    ALTER TABLE rf_user_guild ADD CONSTRAINT rf_user_guild_status_check
      CHECK (status IN ('aktiv', 'inaktiv', 'deaktiviert'));
  END IF;
END $$;
