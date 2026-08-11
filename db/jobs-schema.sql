-- ============================================================================
-- ZapKitt Jobs V0.5 — Neon PostgreSQL schema
--
-- Run this in the Neon SQL editor once. This is a SEPARATE database from
-- the Supabase instance used by accounts/profiles/H1B. The two databases
-- are independent.
-- ============================================================================

CREATE TABLE IF NOT EXISTS jobs (
  id                        SERIAL PRIMARY KEY,
  source                    TEXT NOT NULL DEFAULT 'usajobs',
  external_id               TEXT NOT NULL,
  source_url                TEXT,
  apply_url                 TEXT,

  company_name              TEXT,
  company_domain            TEXT,

  title                     TEXT NOT NULL,
  description               TEXT,

  location_raw              TEXT,
  city                      TEXT,
  state                     TEXT,
  country                   TEXT DEFAULT 'US',

  remote_type               TEXT CHECK (remote_type IN ('REMOTE_US','REMOTE_GLOBAL','HYBRID','ONSITE','UNKNOWN')),
  employment_type           TEXT,

  experience_min            INT,
  experience_max            INT,

  salary_min                NUMERIC(12,2),
  salary_max                NUMERIC(12,2),
  salary_currency           TEXT DEFAULT 'USD',

  skills                    JSONB,

  is_it_job                 BOOLEAN,
  it_category               TEXT,
  classification_method     TEXT,                -- RULE | AI | RULE_PARTIAL | UNKNOWN
  classification_confidence REAL,

  h1b_status                TEXT DEFAULT 'UNKNOWN' CHECK (h1b_status IN ('EXPLICIT','UNKNOWN','NOT_SUPPORTED')),
  h1b_confidence            REAL DEFAULT 0,
  h1b_evidence              TEXT DEFAULT '',

  sponsorship_status        TEXT DEFAULT 'UNKNOWN' CHECK (sponsorship_status IN ('EXPLICIT','UNKNOWN','NOT_SUPPORTED')),
  sponsorship_confidence    REAL DEFAULT 0,
  sponsorship_evidence      TEXT DEFAULT '',

  posted_at                 TIMESTAMPTZ,
  first_seen_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- LCA / DOL enrichment fields
  h1b_lca_status            TEXT,        -- STRONG_SPONSOR | ACTIVE_SPONSOR | OCCASIONAL_SPONSOR | STOPPED
  h1b_lca_filings           INT,         -- total certified LCA filings
  h1b_lca_latest            INT,         -- latest FY certified filings
  h1b_lca_wage_median       INT,         -- median wage from LCA data
  h1b_lca_evidence          TEXT,        -- human-readable evidence string

  job_hash                  TEXT NOT NULL,

  status                    TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','removed')),

  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique constraint: one record per source+external_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_source_extid ON jobs (source, external_id);

-- Deduplication by content hash
CREATE INDEX IF NOT EXISTS idx_jobs_hash ON jobs (job_hash);

-- Dashboard queries
CREATE INDEX IF NOT EXISTS idx_jobs_posted ON jobs (posted_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_jobs_it ON jobs (is_it_job) WHERE is_it_job = true;
CREATE INDEX IF NOT EXISTS idx_jobs_category ON jobs (it_category);
CREATE INDEX IF NOT EXISTS idx_jobs_h1b ON jobs (h1b_status);
CREATE INDEX IF NOT EXISTS idx_jobs_sponsor ON jobs (sponsorship_status);
CREATE INDEX IF NOT EXISTS idx_jobs_remote ON jobs (remote_type);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (status);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION jobs_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS jobs_touch ON jobs;
CREATE TRIGGER jobs_touch BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION jobs_touch_updated_at();

-- ── Cron logs ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_cron_logs (
  id            SERIAL PRIMARY KEY,
  status        TEXT NOT NULL,          -- success | error
  jobs_fetched  INT DEFAULT 0,
  jobs_inserted INT DEFAULT 0,
  duplicates    INT DEFAULT 0,
  ai_processed  INT DEFAULT 0,
  ai_failures   INT DEFAULT 0,
  errors        JSONB,
  duration_ms   INT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
