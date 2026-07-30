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

---

# Accounts (auth, profile, usage, saved resumes)

Accounts are **optional**. Every tool works signed out; an account adds saved
resumes, the OPT countdown, and usage history.

## Why there is no API route for this

The browser talks to Supabase directly using the signed-in user's JWT. Row
Level Security in [`accounts-schema.sql`](accounts-schema.sql) is the access
control — every policy is `auth.uid() = user_id`, enforced by Postgres.

Two reasons this matters:

1. **Vercel Hobby caps this project at 12 serverless functions and it is at
   11.** Proxying profile reads through our own API would have spent the last
   slot on something Postgres already does.
2. Access control lives in one place. A new endpoint cannot forget to check
   ownership, because there are no endpoints.

The **anon key ships in client JavaScript**. That is what it is for — it grants
nothing on its own, since every table denies by default. **Never** put the
`service_role` key in client code; it bypasses RLS entirely.

## Setup

1. Create a Supabase project (the free tier is enough).
2. **Authentication → Providers**: enable **Email** (magic link — no passwords
   to store or leak) and **Google**.
3. **Authentication → URL Configuration**: set the site URL to
   `https://zapkitt.com` and add `https://zapkitt.com/account` as a redirect
   URL. Add `http://localhost:4599/account` too if you develop locally.
4. Run [`accounts-schema.sql`](accounts-schema.sql) in the SQL editor.
5. Paste the project URL and **anon** key into the top of
   [`../zapkitt-auth.js`](../zapkitt-auth.js):

   ```js
   var SUPABASE_URL = 'https://xxxx.supabase.co';
   var SUPABASE_ANON_KEY = 'eyJ...';
   ```

Until those are filled in, `ZK.auth.ready()` is false and `/account` shows
"Accounts are not switched on yet" rather than erroring. No other page changes.

## Recording usage

One line at the point a tool actually succeeds:

```js
try{ if(window.ZK&&ZK.auth&&ZK.auth.signedIn()) ZK.auth.record('ats'); }catch(e){}
```

Fire-and-forget on purpose: a tool must never fail because logging failed, and
signed-out users are skipped. Currently wired on the ATS checker. Tool keys:
`ats`, `resume`, `interview`, `referral`.

`ZK.auth.usageToday()` returns `{ats: 3, resume: 1}` for the free daily limit
when you add one. Counting is server-side via the `usage_today()` function, and
there is deliberately no update or delete policy on `usage_events` — a usage
record must not be editable by the person it limits.

## The OPT clock

`ZK.auth.optClock(profile)` returns `{used, left, started}` counting from
`opt_start_date` while `employed` is false. It is a planning aid, not a legal
record — USCIS counts cumulative unemployed days across the whole OPT period,
and the dashboard says so under the number. Do not present it as authoritative.
