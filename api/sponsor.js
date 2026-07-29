// ============================================================================
// ZapKitt — H-1B sponsor lookup  (GET /api/sponsor)
//
//   GET /api/sponsor?q=deloi&mode=suggest   -> autocomplete list
//   GET /api/sponsor?company=Deloitte       -> full sponsorship check
//   GET /api/sponsor?company=Deloitte&role=data%20analyst
//
// Data lives in Supabase (see db/h1b-schema.sql), loaded by
// scripts/ingest-lca.mjs from DOL LCA disclosure files.
//
// No model is involved anywhere in this route. Every number returned is a count
// from the DOL dataset and every verdict is computed by verdict() in _h1b.js.
// See the accuracy contract at the top of that file.
// ============================================================================
import { rateLimit, clientIP } from './_ratelimit.js';
import { normalizeEmployer, normalizeRole, buildResult } from './_h1b.js';
import { SAMPLE_EMPLOYERS } from './_h1b-sample.js';

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY || '';

// Sample data is OPT-IN. Without this flag an unconfigured deployment returns
// "not loaded" rather than quietly serving placeholder figures as if they were
// DOL records — that mistake would cost more trust than the outage does.
const SAMPLE_MODE = process.env.H1B_SAMPLE_DATA === '1';

function dbReady() { return !!(SUPABASE_URL && SUPABASE_KEY); }

async function sb(pathAndQuery, init) {
  const res = await fetch(SUPABASE_URL + pathAndQuery, {
    ...init,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      ...(init && init.headers)
    }
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error('supabase ' + res.status + ' ' + body.slice(0, 200));
  }
  return res.json();
}

// ── Lookups ─────────────────────────────────────────────────────────────────
async function lookupExact(key) {
  const rows = await sb('/rest/v1/h1b_employers?select=*&limit=1&employer_key=eq.' + encodeURIComponent(key));
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function searchFuzzy(q, limit) {
  return sb('/rest/v1/rpc/h1b_search', {
    method: 'POST',
    body: JSON.stringify({ q, lim: limit })
  });
}

// ── Sample fallback (local development only) ────────────────────────────────
function sampleExact(key) {
  return SAMPLE_EMPLOYERS.find(r => r.employer_key === key) || null;
}

function sampleSearch(q, limit) {
  const key = normalizeEmployer(q);
  const raw = String(q || '').toLowerCase().trim();
  if (!key) return [];
  return SAMPLE_EMPLOYERS
    .map(r => {
      let rank = 0;
      if (r.employer_key === key) rank = 4;
      else if (r.employer_name.toLowerCase().startsWith(raw)) rank = 3;
      else if (r.employer_key.startsWith(key)) rank = 2.5;
      else if (r.employer_name.toLowerCase().includes(raw)) rank = 2;
      return { ...r, rank };
    })
    .filter(r => r.rank > 0)
    .sort((a, b) => b.rank - a.rank || b.certified - a.certified)
    .slice(0, limit);
}

// ── Role matching ───────────────────────────────────────────────────────────
// Answers "does this employer sponsor for MY role", which is the question
// behind the search. Matched on normalised titles, in code.
function matchRoles(roles, roleQuery) {
  const want = normalizeRole(roleQuery);
  if (!want || !Array.isArray(roles)) return null;

  const words = want.split(' ').filter(w => w.length > 2);
  if (!words.length) return null;

  // EVERY significant word must appear, not just any of them. Matching on "any"
  // makes "data analyst" pull in "Business Analyst", and the filing total we
  // then print is the sum of two unrelated roles — a number that overstates the
  // user's actual odds. Someone who searches "analyst" alone still gets both.
  const scored = roles.map(r => {
    const key = String(r.key || '').toUpperCase();
    if (!words.every(w => key.includes(w))) return null;
    return { ...r, _score: key === want ? 100 : (key.includes(want) ? 60 : 30) };
  }).filter(Boolean);

  if (!scored.length) return { query: roleQuery, matches: [], certified: 0 };

  scored.sort((a, b) => b._score - a._score || b.certified - a.certified);
  const matches = scored.slice(0, 6).map(({ _score, ...r }) => r);
  return {
    query: roleQuery,
    matches,
    certified: scored.reduce((n, r) => n + (Number(r.certified) || 0), 0)
  };
}

// ── Handler ─────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const origins = ['https://zapkitt.com', 'https://www.zapkitt.com'];
  const o = req.headers.origin || '';
  res.setHeader('Access-Control-Allow-Origin', origins.includes(o) ? o : origins[0]);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const q = req.query || {};
  const mode = String(q.mode || 'check');
  // Company names are short. Anything longer is not a company name.
  const raw = String(q.company || q.q || '').slice(0, 120).trim();
  const role = String(q.role || '').slice(0, 120).trim();

  if (!raw) return res.status(400).json({ error: 'Provide a company name.' });

  const ip = clientIP(req);
  // Suggestions fire on keystrokes, so they get a much wider window than a
  // full check. Both are per-IP and Upstash-backed.
  const rl = mode === 'suggest'
    ? await rateLimit('sponsor-suggest:' + ip, 120, 60)
    : await rateLimit('sponsor:' + ip, 40, 60);
  if (!rl.ok) return res.status(429).json({ error: 'Too many lookups. Please wait a minute and try again.' });

  const usingDb = dbReady();
  if (!usingDb && !SAMPLE_MODE) {
    // The operator instructions go to the logs, not the response body. This is
    // a public endpoint; there is no reason to tell the internet our file
    // layout and environment variable names.
    console.error('sponsor: no database configured. Run db/h1b-schema.sql, load it with scripts/ingest-lca.mjs, then set SUPABASE_URL and SUPABASE_ANON_KEY.');
    return res.status(503).json({ error: 'Sponsor data is not loaded yet.' });
  }
  const source = usingDb ? 'db' : 'sample';

  try {
    // ── Autocomplete ────────────────────────────────────────────────────────
    if (mode === 'suggest') {
      const hits = usingDb ? await searchFuzzy(raw, 8) : sampleSearch(raw, 8);
      return res.status(200).json({
        source,
        suggestions: (hits || []).map(h => ({
          name: h.employer_name,
          key: h.employer_key,
          certified: h.certified,
          latestFy: h.latest_fy,
          latestFyCertified: h.latest_fy_certified
        }))
      });
    }

    // ── Full check ──────────────────────────────────────────────────────────
    const key = normalizeEmployer(raw);
    let row = key ? (usingDb ? await lookupExact(key) : sampleExact(key)) : null;
    let matchedExactly = !!row;
    let alternatives = [];

    if (!row) {
      // No exact key. Fall back to fuzzy search and take the best hit, but keep
      // the runners-up so the page can offer "did you mean" instead of
      // silently answering about a different company.
      const hits = (usingDb ? await searchFuzzy(raw, 6) : sampleSearch(raw, 6)) || [];
      if (hits.length) {
        row = usingDb ? await lookupExact(hits[0].employer_key) : sampleExact(hits[0].employer_key);
        alternatives = hits.slice(1).map(h => ({ name: h.employer_name, certified: h.certified }));
      }
    } else {
      const hits = (usingDb ? await searchFuzzy(raw, 4) : sampleSearch(raw, 4)) || [];
      alternatives = hits
        .filter(h => h.employer_key !== key)
        .map(h => ({ name: h.employer_name, certified: h.certified }));
    }

    const result = buildResult(row, { query: raw, source });
    result.matchedExactly = matchedExactly;
    result.alternatives = alternatives;
    if (row && role) result.roleMatch = matchRoles(row.roles, role);

    // Sponsor data changes quarterly at most, so let the CDN hold it. The
    // global no-store header on /api/* in vercel.json is overridden here.
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json(result);
  } catch (e) {
    console.error('sponsor lookup failed:', e.message);
    return res.status(502).json({ error: 'Sponsor data is temporarily unavailable. Please try again shortly.' });
  }
}
