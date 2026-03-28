-- Diagnose-Tabelle für Bot-/Webapp-Checks (z. B. /raidflow check)
CREATE TABLE "rf_bot_diagnostic_log" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "discord_guild_id" TEXT,
    "discord_user_id" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "summary_line" VARCHAR(500),
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rf_bot_diagnostic_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "rf_bot_diagnostic_log_created_at_idx" ON "rf_bot_diagnostic_log" ("created_at" DESC);
