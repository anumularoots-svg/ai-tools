-- ============================================================================
-- ZapKitt Jobs — LCA enrichment columns migration
--
-- Run this in the Neon SQL editor to add LCA columns to existing jobs table.
-- Safe to run multiple times (uses IF NOT EXISTS pattern).
-- ============================================================================

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS h1b_lca_status TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS h1b_lca_filings INT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS h1b_lca_latest INT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS h1b_lca_wage_median INT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS h1b_lca_evidence TEXT;

-- Index for LCA sponsor queries
CREATE INDEX IF NOT EXISTS idx_jobs_lca_status ON jobs (h1b_lca_status);

-- Verify
SELECT column_name FROM information_schema.columns
WHERE table_name = 'jobs' AND column_name LIKE 'h1b_lca%'
ORDER BY column_name;
