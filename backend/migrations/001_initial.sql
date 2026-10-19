-- Captain Glow Marketing Center: initial schema

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS customers (
  id                SERIAL PRIMARY KEY,
  external_id       TEXT UNIQUE,              -- e.g. the Wave customer ID
  source            TEXT NOT NULL DEFAULT 'manual',  -- manual | csv | wave
  first_name        TEXT,
  last_name         TEXT,
  company_name      TEXT,
  email             TEXT,                     -- always trimmed + lower-cased
  phone             TEXT,
  phone_last10      TEXT,                     -- digits only, last 10, for matching
  address_line      TEXT,
  city              TEXT,
  state             TEXT,
  postal_code       TEXT,
  notes             TEXT,
  disabled          BOOLEAN NOT NULL DEFAULT false,
  unsubscribed      BOOLEAN NOT NULL DEFAULT false,
  unsubscribed_at   TIMESTAMPTZ,
  sms_consent       BOOLEAN NOT NULL DEFAULT false,
  sms_consent_at    TIMESTAMPTZ,
  unsubscribe_token TEXT NOT NULL UNIQUE DEFAULT md5(random()::text || clock_timestamp()::text),
  last_emailed_at   TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS customers_email_uniq ON customers (email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS customers_phone_idx ON customers (phone_last10);
CREATE INDEX IF NOT EXISTS customers_created_idx ON customers (created_at);

CREATE TABLE IF NOT EXISTS customer_groups (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customer_group_members (
  group_id    INTEGER NOT NULL REFERENCES customer_groups(id) ON DELETE CASCADE,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, customer_id)
);
CREATE INDEX IF NOT EXISTS cgm_customer_idx ON customer_group_members (customer_id);

CREATE TABLE IF NOT EXISTS email_templates (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  subject     TEXT NOT NULL DEFAULT '',
  preheader   TEXT NOT NULL DEFAULT '',
  blocks      JSONB NOT NULL DEFAULT '[]',
  is_starter  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS campaigns (
  id                 SERIAL PRIMARY KEY,
  name               TEXT NOT NULL,
  channel            TEXT NOT NULL DEFAULT 'email',      -- email | sms
  status             TEXT NOT NULL DEFAULT 'draft',      -- draft | active | paused | completed | cancelled
  template_id        INTEGER REFERENCES email_templates(id) ON DELETE SET NULL,
  subject            TEXT NOT NULL DEFAULT '',
  preheader          TEXT NOT NULL DEFAULT '',
  blocks             JSONB NOT NULL DEFAULT '[]',
  sms_body           TEXT NOT NULL DEFAULT '',
  audience           JSONB NOT NULL DEFAULT '{"type":"all"}',
  recurrence         JSONB NOT NULL DEFAULT '{"type":"once"}',
  from_name          TEXT,
  from_email         TEXT,
  reply_to           TEXT,
  test_mode          BOOLEAN NOT NULL DEFAULT false,
  test_email         TEXT,
  test_phone         TEXT,
  current_occurrence INTEGER NOT NULL DEFAULT 0,
  next_run_date      DATE,
  audience_built_on  DATE,
  occurrences_done   INTEGER NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at         TIMESTAMPTZ,
  completed_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS campaigns_status_idx ON campaigns (status, created_at);

CREATE TABLE IF NOT EXISTS campaign_recipients (
  id              BIGSERIAL PRIMARY KEY,
  campaign_id     INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  customer_id     INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  occurrence      INTEGER NOT NULL DEFAULT 1,
  channel         TEXT NOT NULL DEFAULT 'email',
  address         TEXT,                       -- email or phone at the moment it was queued
  status          TEXT NOT NULL DEFAULT 'queued', -- queued | sending | sent | failed | skipped | bounced
  attempts        INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ,
  last_error      TEXT,
  token           TEXT NOT NULL UNIQUE DEFAULT md5(random()::text || clock_timestamp()::text),
  provider_id     TEXT,
  queued_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at         TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  opened_at       TIMESTAMPTZ,
  clicked_at      TIMESTAMPTZ,
  bounced_at      TIMESTAMPTZ
);
-- The database itself makes double-sending impossible.
CREATE UNIQUE INDEX IF NOT EXISTS campaign_recipients_once
  ON campaign_recipients (campaign_id, customer_id, occurrence);
CREATE INDEX IF NOT EXISTS campaign_recipients_queue
  ON campaign_recipients (campaign_id, status, id);
CREATE INDEX IF NOT EXISTS campaign_recipients_customer ON campaign_recipients (customer_id);
CREATE INDEX IF NOT EXISTS campaign_recipients_provider ON campaign_recipients (provider_id);

CREATE TABLE IF NOT EXISTS email_events (
  id           BIGSERIAL PRIMARY KEY,
  campaign_id  INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
  recipient_id BIGINT REFERENCES campaign_recipients(id) ON DELETE CASCADE,
  customer_id  INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  channel      TEXT NOT NULL DEFAULT 'email',
  type         TEXT NOT NULL,  -- sent | delivered | opened | clicked | bounced | complained | failed | unsubscribed
  meta         JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_events_campaign ON email_events (campaign_id, type);
CREATE INDEX IF NOT EXISTS email_events_customer ON email_events (customer_id, created_at);
CREATE INDEX IF NOT EXISTS email_events_created ON email_events (created_at);

CREATE TABLE IF NOT EXISTS unsubscribe_records (
  id          SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  email       TEXT,
  phone       TEXT,
  channel     TEXT NOT NULL DEFAULT 'email',
  source      TEXT NOT NULL,  -- link | one_click | sms_stop | sms_start | admin | complaint
  campaign_id INTEGER REFERENCES campaigns(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS suppression_list (
  email      TEXT PRIMARY KEY,
  reason     TEXT NOT NULL,  -- hard_bounce | complaint | manual
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sms_suppression_list (
  phone_last10 TEXT PRIMARY KEY,
  reason       TEXT NOT NULL,  -- stop | manual
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leads (
  id              SERIAL PRIMARY KEY,
  customer_id     INTEGER REFERENCES customers(id) ON DELETE CASCADE,
  campaign_id     INTEGER REFERENCES campaigns(id) ON DELETE SET NULL,
  recipient_id    BIGINT REFERENCES campaign_recipients(id) ON DELETE SET NULL,
  label           TEXT NOT NULL DEFAULT 'Interested',
  url             TEXT,
  status          TEXT NOT NULL DEFAULT 'new', -- new | contacted | quoted | won | lost
  notes           TEXT,
  click_count     INTEGER NOT NULL DEFAULT 1,
  last_clicked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS leads_recipient_label ON leads (recipient_id, label) WHERE recipient_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS leads_status ON leads (status, created_at);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id         BIGSERIAL PRIMARY KEY,
  user_email TEXT,
  action     TEXT NOT NULL,
  details    JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_created ON audit_logs (created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id         SERIAL PRIMARY KEY,
  kind       TEXT NOT NULL DEFAULT 'info',  -- info | success | warning | error
  title      TEXT NOT NULL,
  body       TEXT,
  link       TEXT,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS daily_send_counts (
  day     DATE NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email',
  count   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, channel)
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id          SERIAL PRIMARY KEY,
  source      TEXT NOT NULL DEFAULT 'wave',
  trigger     TEXT NOT NULL DEFAULT 'nightly', -- nightly | manual
  status      TEXT NOT NULL DEFAULT 'running', -- running | success | failed
  local_day   DATE NOT NULL,
  created     INTEGER NOT NULL DEFAULT 0,
  updated     INTEGER NOT NULL DEFAULT 0,
  skipped     INTEGER NOT NULL DEFAULT 0,
  error       TEXT,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS sync_runs_day ON sync_runs (local_day, status);
