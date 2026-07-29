-- ============================================================================
-- ZapKitt — H-1B sponsor database schema (Supabase / PostgreSQL)
--
-- Run once in the Supabase SQL editor, then load data with:
--   node scripts/ingest-lca.mjs --in ./lca-data --push
--
-- Source data: US Department of Labor LCA (Form ETA-9035) disclosure files.
-- Public record. See the accuracy contract in api/_h1b.js before changing the
-- meaning of any column here.
-- ============================================================================

-- Trigram index support, for "delotte" -> "Deloitte" style fuzzy matching.
create extension if not exists pg_trgm;

create table if not exists h1b_employers (
  id                   bigserial primary key,

  -- Normalised join key from normalizeEmployer() in api/_h1b.js. Legal suffixes
  -- and punctuation stripped, so "Amazon.com Services LLC" and
  -- "AMAZON COM SERVICES, L.L.C." collapse to one row.
  employer_key         text        not null unique,

  -- Most common raw spelling, title-cased. What the user actually sees.
  employer_name        text        not null,

  -- All counts are over the fiscal-year window loaded by the ingest script
  -- (default: the 3 most recent). They are consistent with each other.
  total_filings        integer     not null default 0,
  certified            integer     not null default 0,
  denied               integer     not null default 0,
  withdrawn            integer     not null default 0,

  -- latest_fy is the most recent fiscal year in the DATASET (the same value on
  -- every row), not this employer's own most recent year. latest_fy_certified
  -- is therefore 0 for an employer that has stopped filing — which is the
  -- signal the verdict depends on.
  latest_fy            integer,
  latest_fy_certified  integer     not null default 0,

  -- { "2023": 812, "2024": 954, "2025": 1103 } — certified filings per FY.
  fy_counts            jsonb       not null default '{}'::jsonb,

  -- [ { "state": "TX", "certified": 412 }, ... ] top 5.
  top_states           jsonb       not null default '[]'::jsonb,

  -- Annualised wages across the loaded window.
  wage_p25             integer,
  wage_median          integer,
  wage_p75             integer,

  -- [ { "key": "SOFTWARE ENGINEER", "title": "Software Engineer",
  --     "certified": 214, "wageMedian": 148000 }, ... ] top 40 by volume.
  roles                jsonb       not null default '[]'::jsonb,

  updated_at           timestamptz not null default now()
);

-- Exact-key lookup is the hot path: the API normalises the query the same way
-- the ingest did and tries this first.
create index if not exists h1b_employers_key_idx
  on h1b_employers (employer_key);

-- Fuzzy + prefix search over the display name.
create index if not exists h1b_employers_name_trgm_idx
  on h1b_employers using gin (employer_name gin_trgm_ops);

create index if not exists h1b_employers_key_trgm_idx
  on h1b_employers using gin (employer_key gin_trgm_ops);

-- Ranking by volume, for "top sponsors" listings and to break search ties.
create index if not exists h1b_employers_certified_idx
  on h1b_employers (certified desc);

-- ── Search RPC ──────────────────────────────────────────────────────────────
-- Ranking, in order of how much the user meant it:
--   1. exact normalised key
--   2. name starts with the query
--   3. name contains the query
--   4. trigram similarity (typos)
-- Ties inside a tier break on filing volume, so "Google LLC" beats a 2-filing
-- consultancy called "Google Marketing Partners".
create or replace function h1b_search(q text, lim integer default 8)
returns table (
  employer_key        text,
  employer_name       text,
  certified           integer,
  latest_fy           integer,
  latest_fy_certified integer,
  rank                real
)
language sql
stable
as $$
  with needle as (
    select
      upper(regexp_replace(coalesce(q, ''), '[^A-Za-z0-9]+', ' ', 'g')) as k,
      lower(trim(coalesce(q, ''))) as raw
  )
  select
    e.employer_key,
    e.employer_name,
    e.certified,
    e.latest_fy,
    e.latest_fy_certified,
    (case
       when e.employer_key = trim(n.k)                    then 4.0
       when lower(e.employer_name) like n.raw || '%'      then 3.0
       when e.employer_key like trim(n.k) || '%'          then 2.5
       when lower(e.employer_name) like '%' || n.raw || '%' then 2.0
       else similarity(e.employer_name, coalesce(q, ''))
     end)::real as rank
  from h1b_employers e, needle n
  where trim(n.k) <> ''
    and (
      e.employer_key = trim(n.k)
      or e.employer_key like trim(n.k) || '%'
      or lower(e.employer_name) like '%' || n.raw || '%'
      or e.employer_name % q
    )
  order by rank desc, e.certified desc
  limit greatest(1, least(coalesce(lim, 8), 25));
$$;

-- ── Read access ─────────────────────────────────────────────────────────────
-- This is public-record data and the tool is free, so anon may read. Writes go
-- through the service-role key used by scripts/ingest-lca.mjs, which bypasses
-- RLS — so no write policy is defined here on purpose.
alter table h1b_employers enable row level security;

drop policy if exists "h1b_employers public read" on h1b_employers;
create policy "h1b_employers public read"
  on h1b_employers for select
  to anon, authenticated
  using (true);

grant execute on function h1b_search(text, integer) to anon, authenticated;
