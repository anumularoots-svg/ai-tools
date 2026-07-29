#!/usr/bin/env node
// ============================================================================
// ZapKitt — DOL LCA disclosure data -> H-1B sponsor database.
//
// Reads the Department of Labor's quarterly LCA disclosure files, aggregates
// them per employer, and writes the result as NDJSON and/or pushes it straight
// into Supabase.
//
//   Source: https://www.dol.gov/agencies/eta/foreign-labor/performance
//   Public record. Free to use. No licence required. Attribute the source.
//
// DOL ships .xlsx. Convert first — the parser here is CSV-only on purpose, so
// this script has zero dependencies:
//
//   libreoffice --headless --convert-to csv --outdir ./lca-data LCA_Disclosure_FY2025.xlsx
//   # or:  in2csv LCA_Disclosure_FY2025.xlsx > lca-data/fy2025.csv
//
// Usage:
//   node scripts/ingest-lca.mjs --in ./lca-data --out ./data
//   node scripts/ingest-lca.mjs --in ./lca-data --push          # upsert to Supabase
//   node scripts/ingest-lca.mjs --in ./lca-data --years 3 --min-filings 1
//
// Push requires (in the environment, never committed):
//   SUPABASE_URL=https://xxxx.supabase.co
//   SUPABASE_SERVICE_KEY=<service_role key>   # service role: this writes
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import {
  normalizeEmployer, normalizeRole, annualizeWage, fiscalYear,
  percentile, pickDisplayName, titleCase
} from '../api/_h1b.js';

// ── CLI ─────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const a = { in: './lca-data', out: './data', years: 3, minFilings: 1, push: false, aliases: './data/h1b-aliases.json', maxRoles: 40, wageSamples: 4000, limit: 0 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const next = () => argv[++i];
    if (k === '--in') a.in = next();
    else if (k === '--out') a.out = next();
    else if (k === '--years') a.years = parseInt(next(), 10);
    else if (k === '--min-filings') a.minFilings = parseInt(next(), 10);
    else if (k === '--max-roles') a.maxRoles = parseInt(next(), 10);
    else if (k === '--wage-samples') a.wageSamples = parseInt(next(), 10);
    else if (k === '--aliases') a.aliases = next();
    else if (k === '--limit') a.limit = parseInt(next(), 10); // debug: stop after N rows
    else if (k === '--push') a.push = true;
    else if (k === '--help' || k === '-h') { usage(); process.exit(0); }
    else { console.error('Unknown argument: ' + k); usage(); process.exit(1); }
  }
  return a;
}

function usage() {
  console.log(`
ingest-lca.mjs — build the ZapKitt H-1B sponsor database from DOL LCA data.

  --in <dir|file>     CSV (or .csv.gz) input. Default ./lca-data
  --out <dir>         Where to write h1b-employers.ndjson. Default ./data
  --years <n>         Keep only the most recent n fiscal years. Default 3
  --min-filings <n>   Drop employers below this many certified filings. Default 1
  --max-roles <n>     Roles stored per employer. Default 40
  --wage-samples <n>  Wage values sampled per employer. Default 4000
  --aliases <file>    Employer key alias map. Default ./data/h1b-aliases.json
  --push              Upsert into Supabase (needs SUPABASE_URL + SUPABASE_SERVICE_KEY)
  --limit <n>         Stop after n data rows (for testing on a large file)
`);
}

// ── CSV ─────────────────────────────────────────────────────────────────────
// RFC 4180: fields may be quoted, quoted fields may contain commas, newlines,
// and "" escapes. A naive line.split(',') corrupts roughly every job title
// containing a comma, so it is worth doing properly.
export function splitCsvLine(line) {
  const out = [];
  let field = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { out.push(field); field = ''; }
    else field += c;
  }
  out.push(field);
  return out;
}

// A record can span multiple physical lines when a quoted field contains a
// newline. Count unescaped quotes to know whether we are still inside one.
function hasOpenQuote(s) {
  let inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '"') continue;
    if (inQuotes && s[i + 1] === '"') { i++; continue; }
    inQuotes = !inQuotes;
  }
  return inQuotes;
}

// ── Column mapping ──────────────────────────────────────────────────────────
// DOL renames columns between years. Each entry is tried in order.
const COLUMNS = {
  employer: ['EMPLOYER_NAME', 'LCA_CASE_EMPLOYER_NAME', 'EMPLOYER_NAME_1'],
  status: ['CASE_STATUS', 'STATUS', 'APPROVAL_STATUS'],
  visa: ['VISA_CLASS', 'PROGRAM', 'VISA_TYPE'],
  title: ['JOB_TITLE', 'LCA_CASE_JOB_TITLE'],
  decided: ['DECISION_DATE', 'LCA_CASE_SUBMIT', 'CASE_SUBMITTED', 'RECEIVED_DATE'],
  wage: ['WAGE_RATE_OF_PAY_FROM', 'WAGE_RATE_OF_PAY_FROM_1', 'LCA_CASE_WAGE_RATE_FROM'],
  wageUnit: ['WAGE_UNIT_OF_PAY', 'WAGE_UNIT_OF_PAY_1', 'LCA_CASE_WAGE_RATE_UNIT'],
  state: ['WORKSITE_STATE', 'WORKSITE_STATE_1', 'LCA_CASE_WORKLOC1_STATE', 'EMPLOYER_STATE']
};

export function mapColumns(header) {
  const idx = {};
  const norm = header.map(h => {
    let s = String(h || '');
    if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1); // UTF-8 BOM on the first cell
    return s.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  });
  for (const field of Object.keys(COLUMNS)) {
    idx[field] = -1;
    for (const candidate of COLUMNS[field]) {
      const at = norm.indexOf(candidate);
      if (at !== -1) { idx[field] = at; break; }
    }
  }
  return idx;
}

// ── Aggregation ─────────────────────────────────────────────────────────────
function newEmployer() {
  return {
    names: Object.create(null),   // raw spelling -> count, for display-name choice
    // Everything countable is bucketed BY FISCAL YEAR so that trimming to the
    // --years window later recomputes every total consistently. Keeping a flat
    // `certified` alongside a per-year map is how you end up publishing a
    // 3-year certified count against an all-time filing count.
    fy: Object.create(null),      // fiscal year -> { filings, certified, denied, withdrawn }
    states: Object.create(null),
    wages: [],
    wagesSeen: 0,
    roles: new Map()              // role key -> { title counts, certified, wages }
  };
}

function fyBucket(e, fy) {
  let b = e.fy[fy];
  if (!b) { b = { filings: 0, certified: 0, denied: 0, withdrawn: 0 }; e.fy[fy] = b; }
  return b;
}

// Reservoir sampling keeps memory bounded on the handful of employers that file
// tens of thousands of times, without biasing the median.
function sampleWage(bucket, wage, cap, rng) {
  bucket.wagesSeen++;
  if (bucket.wages.length < cap) { bucket.wages.push(wage); return; }
  const j = Math.floor(rng() * bucket.wagesSeen);
  if (j < cap) bucket.wages[j] = wage;
}

// Deterministic PRNG so two runs over the same input produce the same medians.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CERTIFIED = /^CERTIFIED/i;            // "CERTIFIED", "CERTIFIED - WITHDRAWN"
const CERT_WITHDRAWN = /WITHDRAWN/i;
const DENIED = /^DENIED/i;

function isH1B(visa) {
  const v = String(visa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return v === '' || v === 'H1B'; // blank = older files that only ever held H-1B
}

async function ingestFile(file, agg, opts, counters) {
  const raw = fs.createReadStream(file);
  const stream = file.endsWith('.gz') ? raw.pipe(zlib.createGunzip()) : raw;
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let idx = null;
  let pending = '';
  const rng = opts.rng;

  for await (const line of rl) {
    // Stitch a record back together if a quoted field wrapped onto a new line.
    const record = pending ? pending + '\n' + line : line;
    if (hasOpenQuote(record)) { pending = record; continue; }
    pending = '';
    if (!record.trim()) continue;

    const cells = splitCsvLine(record);

    if (idx === null) {
      idx = mapColumns(cells);
      if (idx.employer === -1 || idx.status === -1) {
        console.warn('  ! skipped (no EMPLOYER_NAME/CASE_STATUS column): ' + path.basename(file));
        rl.close();
        return;
      }
      continue;
    }

    counters.rows++;
    if (opts.limit && counters.rows > opts.limit) { rl.close(); return; }

    const visa = idx.visa === -1 ? '' : cells[idx.visa];
    if (!isH1B(visa)) { counters.skippedVisa++; continue; }

    const rawName = (cells[idx.employer] || '').trim();
    if (!rawName) { counters.skippedNoName++; continue; }

    const fy = idx.decided === -1 ? null : fiscalYear(cells[idx.decided]);
    if (fy === null) { counters.skippedNoDate++; continue; }
    if (fy > counters.maxFy) counters.maxFy = fy;

    let key = normalizeEmployer(rawName);
    if (!key) { counters.skippedNoName++; continue; }
    const alias = opts.aliases[key];
    if (alias) key = alias;

    let e = agg.get(key);
    if (!e) { e = newEmployer(); agg.set(key, e); }

    e.names[rawName] = (e.names[rawName] || 0) + 1;
    const bucket = fyBucket(e, fy);
    bucket.filings++;

    const status = String(cells[idx.status] || '');
    const certified = CERTIFIED.test(status);
    if (DENIED.test(status)) bucket.denied++;
    // A "CERTIFIED - WITHDRAWN" case was certified by DOL but the employer
    // pulled it. It still evidences sponsorship intent, so it counts as
    // certified, but the withdrawal is recorded for the data-quality flag.
    if (CERT_WITHDRAWN.test(status)) bucket.withdrawn++;

    if (!certified) { counters.notCertified++; continue; }

    bucket.certified++;
    counters.certified++;

    const st = idx.state === -1 ? '' : String(cells[idx.state] || '').trim().toUpperCase().slice(0, 2);
    if (st.length === 2) e.states[st] = (e.states[st] || 0) + 1;

    const wage = (idx.wage === -1 || idx.wageUnit === -1)
      ? null
      : annualizeWage(cells[idx.wage], cells[idx.wageUnit]);
    if (wage !== null) sampleWage(e, wage, opts.wageSamples, rng);

    const rawTitle = idx.title === -1 ? '' : (cells[idx.title] || '').trim();
    const roleKey = normalizeRole(rawTitle);
    if (roleKey) {
      let r = e.roles.get(roleKey);
      if (!r) { r = { titles: Object.create(null), certified: 0, wages: [], wagesSeen: 0 }; e.roles.set(roleKey, r); }
      r.titles[rawTitle] = (r.titles[rawTitle] || 0) + 1;
      r.certified++;
      if (wage !== null) sampleWage(r, wage, 500, rng);
    }
  }
}

// ── Row building ────────────────────────────────────────────────────────────
// datasetFy is the most recent fiscal year present anywhere in the input, NOT
// this employer's own most recent year. The verdict asks "are they sponsoring
// now", so an employer with 400 filings in FY2023 and nothing since must show
// latest_fy_certified = 0 and land in the "stopped filing" tier.
function toRow(key, e, opts, datasetFy) {
  const wages = e.wages.slice().sort((a, b) => a - b);
  const years = Object.keys(e.fy).map(Number).sort((a, b) => a - b);

  let totalFilings = 0, certified = 0, denied = 0, withdrawn = 0;
  for (const y of years) {
    const b = e.fy[y];
    totalFilings += b.filings; certified += b.certified;
    denied += b.denied; withdrawn += b.withdrawn;
  }

  const topStates = Object.keys(e.states)
    .sort((a, b) => e.states[b] - e.states[a])
    .slice(0, 5)
    .map(st => ({ state: st, certified: e.states[st] }));

  const roles = Array.from(e.roles.entries())
    .sort((a, b) => b[1].certified - a[1].certified)
    .slice(0, opts.maxRoles)
    .map(([roleKey, r]) => {
      const rw = r.wages.slice().sort((a, b) => a - b);
      return {
        key: roleKey,
        title: titleCase(pickDisplayName(r.titles) || roleKey),
        certified: r.certified,
        wageMedian: percentile(rw, 0.5)
      };
    });

  const fyCounts = {};
  for (const y of years) fyCounts[y] = e.fy[y].certified;

  return {
    employer_key: key,
    employer_name: pickDisplayName(e.names),
    total_filings: totalFilings,
    certified: certified,
    denied: denied,
    withdrawn: withdrawn,
    latest_fy: datasetFy,
    latest_fy_certified: e.fy[datasetFy] ? e.fy[datasetFy].certified : 0,
    fy_counts: fyCounts,
    top_states: topStates,
    wage_p25: percentile(wages, 0.25),
    wage_median: percentile(wages, 0.5),
    wage_p75: percentile(wages, 0.75),
    roles
  };
}

// ── Supabase push ───────────────────────────────────────────────────────────
async function push(rows) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error('\n--push needs SUPABASE_URL and SUPABASE_SERVICE_KEY in the environment.');
    process.exit(1);
  }
  const endpoint = url.replace(/\/+$/, '') + '/rest/v1/h1b_employers?on_conflict=employer_key';
  const BATCH = 500;
  let done = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(chunk)
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error('Supabase upsert failed (' + res.status + '): ' + body.slice(0, 500));
    }
    done += chunk.length;
    process.stdout.write('\r  pushed ' + done.toLocaleString() + ' / ' + rows.length.toLocaleString());
  }
  process.stdout.write('\n');
}

// ── Main ────────────────────────────────────────────────────────────────────
function listInputs(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) return [target];
  return fs.readdirSync(target)
    .filter(f => /\.csv(\.gz)?$/i.test(f))
    .map(f => path.join(target, f))
    .sort();
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(opts.in)) {
    console.error('Input not found: ' + opts.in + '\nDownload the DOL LCA disclosure files and convert them to CSV first (see the header of this file).');
    process.exit(1);
  }

  const files = listInputs(opts.in);
  if (!files.length) { console.error('No .csv or .csv.gz files in ' + opts.in); process.exit(1); }

  let aliases = {};
  if (fs.existsSync(opts.aliases)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(opts.aliases, 'utf8'));
      // Underscore-prefixed keys are documentation inside the JSON file, not
      // aliases. Employer keys are uppercase A-Z0-9 and spaces only.
      for (const k of Object.keys(parsed)) if (!k.startsWith('_')) aliases[k] = parsed[k];
      console.log('Loaded ' + Object.keys(aliases).length + ' employer aliases.');
    } catch (e) { console.warn('Could not read alias map (' + e.message + ') — continuing without it.'); }
  }

  const agg = new Map();
  const counters = { rows: 0, certified: 0, notCertified: 0, skippedVisa: 0, skippedNoName: 0, skippedNoDate: 0, maxFy: 0 };
  const runOpts = { ...opts, aliases, rng: mulberry32(20260729) };

  // Reading is unfiltered by year: we cannot know the latest fiscal year in the
  // data until we have read it. The --years window is applied afterwards.
  console.log('Reading ' + files.length + ' file(s) from ' + opts.in + '\n');
  for (const f of files) {
    const size = (fs.statSync(f).size / 1048576).toFixed(0);
    process.stdout.write('  ' + path.basename(f) + ' (' + size + ' MB) ... ');
    const before = counters.rows;
    await ingestFile(f, agg, runOpts, counters);
    console.log((counters.rows - before).toLocaleString() + ' rows');
    if (opts.limit && counters.rows > opts.limit) break;
  }

  // Trim to the requested window of fiscal years. Counts are per-year buckets,
  // so dropping years here keeps filings/certified/denied consistent with each
  // other. Wage samples and the role mix deliberately span every loaded year —
  // a 3-year sample gives a far more stable median than one year would.
  const cutoff = counters.maxFy ? counters.maxFy - (opts.years - 1) : 0;
  const rows = [];
  for (const [key, e] of agg) {
    for (const y of Object.keys(e.fy)) if (Number(y) < cutoff) delete e.fy[y];
    const row = toRow(key, e, opts, counters.maxFy);
    if (row.certified < opts.minFilings) continue;
    rows.push(row);
  }
  rows.sort((a, b) => b.certified - a.certified);

  console.log('\n--- Summary ---');
  console.log('Rows read           : ' + counters.rows.toLocaleString());
  console.log('Certified H-1B LCAs : ' + counters.certified.toLocaleString());
  console.log('Not certified       : ' + counters.notCertified.toLocaleString());
  console.log('Skipped (non-H-1B)  : ' + counters.skippedVisa.toLocaleString());
  console.log('Skipped (no date)   : ' + counters.skippedNoDate.toLocaleString());
  console.log('Fiscal years kept   : FY' + cutoff + ' - FY' + counters.maxFy);
  console.log('Employers written   : ' + rows.length.toLocaleString());
  if (rows.length) console.log('Largest sponsor     : ' + rows[0].employer_name + ' (' + rows[0].certified.toLocaleString() + ')');

  fs.mkdirSync(opts.out, { recursive: true });
  const outFile = path.join(opts.out, 'h1b-employers.ndjson');
  const fd = fs.openSync(outFile, 'w');
  for (const r of rows) fs.writeSync(fd, JSON.stringify(r) + '\n');
  fs.closeSync(fd);
  console.log('\nWrote ' + outFile);

  fs.writeFileSync(path.join(opts.out, 'h1b-meta.json'), JSON.stringify({
    source: 'US Department of Labor, LCA (Form ETA-9035) disclosure data',
    sourceUrl: 'https://www.dol.gov/agencies/eta/foreign-labor/performance',
    fiscalYears: { from: cutoff, to: counters.maxFy },
    employers: rows.length,
    certifiedFilings: counters.certified,
    files: files.map(f => path.basename(f))
  }, null, 2) + '\n');

  if (opts.push) {
    console.log('\nPushing to Supabase...');
    await push(rows);
    console.log('Done.');
  } else {
    console.log('\nNot pushed. Re-run with --push (and SUPABASE_URL + SUPABASE_SERVICE_KEY set) to load Supabase.');
  }
}

// Only run when executed directly, so the tests can import the parser helpers.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error('\n' + (e.stack || e)); process.exit(1); });
}
