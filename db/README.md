# H-1B Sponsor Checker — setup

The tool at `/h1b-sponsor-check` answers "does this company sponsor?" from public
US Department of Labor records. This is what it takes to get real data behind it.

Until Supabase is configured, `/api/sponsor` returns **503 "Sponsor data is not
loaded yet"**. That is deliberate — see step 5 for how to run the page locally
without a database.

---

## 1. Create the tables

In the Supabase SQL editor, run [`h1b-schema.sql`](h1b-schema.sql). It creates
the `h1b_employers` table, the trigram indexes, the `h1b_search()` RPC used for
fuzzy company matching, and a public read policy.

## 2. Download the DOL data

<https://www.dol.gov/agencies/eta/foreign-labor/performance> — "LCA Programs
(H-1B, H-1B1, E-3)". Public record, free, no licence, released quarterly.

Grab the three most recent fiscal years into `./lca-data/`.

## 3. Convert to CSV

DOL ships `.xlsx`. The ingest script is CSV-only so it has zero dependencies:

```bash
libreoffice --headless --convert-to csv --outdir ./lca-data LCA_Disclosure_FY2025.xlsx
# or, with csvkit:
in2csv LCA_Disclosure_FY2025.xlsx > lca-data/fy2025.csv
```

`.csv.gz` is also accepted.

## 4. Ingest

```bash
export SUPABASE_URL=https://xxxx.supabase.co
export SUPABASE_SERVICE_KEY=<service_role key>    # writes; never ship to the client

node scripts/ingest-lca.mjs --in ./lca-data --out ./data --push
```

Run it once without `--push` first. It prints a summary and writes
`data/h1b-employers.ndjson` so you can eyeball the output before loading it.

What it does: filters to H-1B, keeps certified filings, normalises employer names
so `Amazon.com Services LLC` / `AMAZON COM SERVICES, L.L.C.` collapse to one row,
annualises wages by pay unit, buckets everything by federal fiscal year
(Oct 1 – Sep 30), and keeps the top 40 roles per employer.

Useful flags: `--years 3`, `--min-filings 1`, `--limit 50000` (test on a big
file), `--aliases ./data/h1b-aliases.json`.

### Split employers

Big companies file under several legal entities. After the first run, scan the
output for names that should be one row and add them to
[`../data/h1b-aliases.json`](../data/h1b-aliases.json), then re-run.

Do **not** alias a staffing vendor into its client. That would credit the client
with sponsorship it never did, which is the exact error this tool exists to
prevent.

## 5. Point the app at it

Set on the Vercel `ai-tools` project:

| Variable | Value |
| --- | --- |
| `SUPABASE_URL` | `https://xxxx.supabase.co` |
| `SUPABASE_ANON_KEY` | anon/publishable key — read-only, RLS-guarded |

`SUPABASE_SERVICE_KEY` belongs only in the shell that runs the ingest. The API
route falls back to it if present, but the anon key is enough and is the safer
thing to have sitting in a serverless env.

**Local development without a database:** set `H1B_SAMPLE_DATA=1` and the API
serves the eight fixtures in `api/_h1b-sample.js`. Those numbers are invented.
Every response is tagged `source:"sample"` and the page shows a banner saying so.
Never set this flag in production.

## 6. Quarterly refresh

DOL publishes new data every quarter. Re-run step 4 — the upsert is keyed on
`employer_key`, so it merges rather than duplicating. Nothing else needs to
change.

---

## Before you change the numbers, read this

`api/_h1b.js` opens with an accuracy contract. The short version:

- An **LCA is not an H-1B petition.** It is the wage filing made to DOL *before* a
  petition goes to USCIS. One LCA can cover several positions and certification
  is not approval. The UI says "filings" everywhere, never "petitions".
- **There is no approval rate.** DOL certifies ~98% of everything it receives, so
  the "94% approval rate" competitors advertise is noise dressed as a signal.
  Filing volume and recency are what actually separate employers.
- **`latest_fy` is the dataset's most recent year, identical on every row** — not
  each employer's own latest year. An employer that filed 400 times in FY2023 and
  nothing since must show `latest_fy_certified = 0` and read as dormant.
- **No model is involved.** Every number is a count; every verdict comes from
  `verdict()` in `api/_h1b.js`.

`node tests/sponsor.test.mjs` covers all of the above.
