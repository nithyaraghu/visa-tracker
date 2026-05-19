-- schema.sql — run once to set up PostgreSQL tables
-- psql $DATABASE_URL -f schema.sql

CREATE TABLE IF NOT EXISTS alert_subscribers (
  id             SERIAL PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  name           TEXT,
  visa_type      TEXT NOT NULL CHECK (visa_type IN ('opt','stem')),
  auth_start     DATE,
  auth_end       DATE,
  employed_since DATE,
  alert_levels   TEXT[] NOT NULL DEFAULT ARRAY['warn','urgent','critical'],
  sent_alerts    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for daily cron lookup
CREATE INDEX IF NOT EXISTS idx_subscribers_visa_type ON alert_subscribers(visa_type);

-- Optional: view showing current status
CREATE OR REPLACE VIEW subscriber_status AS
SELECT
  id, email, name, visa_type,
  auth_start, auth_end, employed_since,
  alert_levels, sent_alerts,
  CURRENT_DATE - auth_start::date AS days_since_auth_start
FROM alert_subscribers;
