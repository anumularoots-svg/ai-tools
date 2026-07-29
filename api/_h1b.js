// ============================================================================
// ZapKitt — H-1B sponsorship data: shared normalisation + verdict logic.
//
// Imported by BOTH the ingest script (scripts/ingest-lca.mjs) and the API route
// (api/sponsor.js). They must agree on employer keys or a search will never
// match what was ingested.
//
// ACCURACY CONTRACT — read this before changing anything:
//
//   The source is DOL LCA disclosure data (Form ETA-9035). An LCA is the
//   prevailing-wage filing an employer makes BEFORE an H-1B petition goes to
//   USCIS. It is NOT an H-1B petition, it is not an approval, and one LCA can
//   cover several positions. So we say "LCA filings", never "petitions filed".
//
//   We also do NOT publish a DOL certification rate as an "approval rate".
//   DOL certifies ~98% of everything it receives, so the number looks
//   impressive and tells the user nothing. It is exposed only as a data-quality
//   signal (a high denial/withdrawal share is worth flagging).
//
//   Every verdict below is computed in code from counts. No model decides
//   whether a company sponsors.
// ============================================================================

// ── Employer name normalisation ─────────────────────────────────────────────
// DOL rows are free text typed by employers: "AMAZON.COM SERVICES LLC",
// "Amazon.com Services, Inc.", "AMAZON COM SERVICES  L.L.C." must collapse to
// one key or the same company appears five times with the counts split.

// Trailing legal-form tokens, stripped repeatedly from the end of the name.
const LEGAL_SUFFIX = new Set([
  'INC', 'INCORPORATED', 'LLC', 'LLP', 'LP', 'LTD', 'LIMITED', 'CORP',
  'CORPORATION', 'CO', 'COMPANY', 'PLC', 'PC', 'PA', 'PLLC', 'LLLP',
  'GMBH', 'NV', 'BV', 'SA', 'AG', 'AB', 'AS', 'OY', 'SRL', 'SPA', 'PTE',
  'PVT', 'PRIVATE', 'USA', 'US', 'AMERICA', 'AMERICAS', 'NA'
]);

function stripAccents(s) {
  // \p{M} = combining marks, left behind by NFD. Using the Unicode property
  // escape keeps this file plain ASCII.
  return s.normalize('NFD').replace(/\p{M}/gu, '');
}

export function normalizeEmployer(name) {
  let s = stripAccents(String(name == null ? '' : name)).toUpperCase();
  s = s.replace(/&/g, ' AND ');
  s = s.replace(/[^A-Z0-9]+/g, ' ').trim();
  if (s.startsWith('THE ')) s = s.slice(4);

  // Strip legal forms from the end until none remain. Guard against eating the
  // whole name: "US CO" must not normalise to an empty string.
  const parts = s.split(' ').filter(Boolean);
  for (;;) {
    if (parts.length > 1 && LEGAL_SUFFIX.has(parts[parts.length - 1])) { parts.pop(); continue; }

    // "L.L.C." became "L L C" when punctuation was replaced with spaces. Glue
    // a trailing run of single letters back together and retry — otherwise
    // "Amazon.com Services L.L.C." and "AMAZON.COM SERVICES LLC" become two
    // separate employers with the filings split between them.
    let run = 0;
    while (run < parts.length && parts[parts.length - 1 - run].length === 1) run++;
    if (run > 1) {
      const glued = parts.slice(parts.length - run).join('');
      if (parts.length - run >= 1 && LEGAL_SUFFIX.has(glued)) { parts.length -= run; continue; }
    }
    break;
  }

  return parts.join(' ');
}

// Best display name for a group of raw spellings: prefer the one that appears
// most often, tie-broken by the shorter string (usually the cleanest).
export function pickDisplayName(counts) {
  let best = null, bestN = -1;
  for (const name of Object.keys(counts)) {
    const n = counts[name];
    if (n > bestN || (n === bestN && best !== null && name.length < best.length)) {
      best = name; bestN = n;
    }
  }
  return best == null ? '' : titleCase(best);
}

// DOL rows are mostly SHOUTING. Title-case them, but leave acronyms and words
// that already have internal capitals alone (IBM, JPMorgan, eBay).
const KEEP_LOWER = new Set(['OF', 'AND', 'THE', 'FOR', 'A', 'AN', 'AT', 'IN', 'ON', 'TO']);
// Conventional English usage: LLC / LLP / PLC / NA stay capitalised, but
// Inc. / Corp. / Co. / Ltd. are written title-case. Both are three letters, so
// there is no rule that gets them right — they have to be listed.
const TITLECASE_SUFFIX = new Set(['INC', 'INCORPORATED', 'CORP', 'CORPORATION', 'CO', 'COMPANY', 'LTD', 'LIMITED']);

export function titleCase(s) {
  const str = String(s == null ? '' : s).trim();
  if (!str) return '';
  if (/[a-z]/.test(str)) return str; // already mixed case — the employer typed it that way
  return str.split(/(\s+)/).map((w, i) => {
    if (/^\s+$/.test(w)) return w;
    const bare = w.replace(/[^A-Za-z]/g, '');
    if (bare.length <= 3 && !KEEP_LOWER.has(bare) && !TITLECASE_SUFFIX.has(bare)) return w; // IBM, KPMG, LLC, AT&T
    if (i > 0 && KEEP_LOWER.has(bare)) return w.toLowerCase();
    return w.charAt(0) + w.slice(1).toLowerCase();
  }).join('');
}

// ── Job title normalisation ─────────────────────────────────────────────────
// Titles carry seniority and team noise ("SR. SOFTWARE ENGINEER II (BACKEND)").
// We strip that so a user searching "software engineer" matches.
const ROLE_NOISE = [
  /\((?:[^)]*)\)/g,                       // parenthetical teams / locations
  /\b(SR|SNR|SENIOR|JR|JUNIOR|LEAD|STAFF|PRINCIPAL|ASSOCIATE|ASSOC)\b/g,
  /\b(I{1,3}|IV|V|VI{1,3}|IX|X)\b/g,      // roman numeral levels
  /\b(LEVEL|LVL|GRADE|BAND)\s*\d+\b/g,
  /\b\d+\b/g
];

export function normalizeRole(title) {
  let s = stripAccents(String(title == null ? '' : title)).toUpperCase();
  for (const re of ROLE_NOISE) s = s.replace(re, ' ');
  s = s.replace(/[^A-Z ]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s;
}

// ── Wages ───────────────────────────────────────────────────────────────────
// WAGE_UNIT_OF_PAY varies by row. Everything is stored annualised so wages are
// comparable across employers.
const WAGE_MULTIPLIER = {
  'YEAR': 1, 'YR': 1, 'ANNUAL': 1, 'ANNUALLY': 1,
  'MONTH': 12, 'MTH': 12, 'MONTHLY': 12,
  'BI-WEEKLY': 26, 'BIWEEKLY': 26, 'BI WEEKLY': 26,
  'WEEK': 52, 'WEEKLY': 52, 'WK': 52,
  'HOUR': 2080, 'HOURLY': 2080, 'HR': 2080
};

export function annualizeWage(amount, unit) {
  const n = typeof amount === 'number' ? amount : parseFloat(String(amount == null ? '' : amount).replace(/[$,]/g, ''));
  if (!isFinite(n) || n <= 0) return null;
  const m = WAGE_MULTIPLIER[String(unit == null ? '' : unit).toUpperCase().trim()];
  if (!m) return null;
  const annual = Math.round(n * m);
  // Reject nonsense: DOL rows do contain unit/amount mismatches (a $150,000
  // row tagged "Hour" would annualise to $312M and wreck the median).
  if (annual < 15000 || annual > 2000000) return null;
  return annual;
}

// ── Fiscal year ─────────────────────────────────────────────────────────────
// The federal fiscal year runs Oct 1 – Sep 30. FY2025 = 2024-10-01 .. 2025-09-30.
export function fiscalYear(dateStr) {
  const s = String(dateStr == null ? '' : dateStr).trim();
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  return d.getUTCMonth() >= 9 ? y + 1 : y;
}

// ── Percentiles ─────────────────────────────────────────────────────────────
export function percentile(sortedNums, p) {
  if (!sortedNums.length) return null;
  const idx = (sortedNums.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sortedNums[lo];
  return Math.round(sortedNums[lo] + (sortedNums[hi] - sortedNums[lo]) * (idx - lo));
}

// ── Verdict ─────────────────────────────────────────────────────────────────
// Thresholds are on CERTIFIED filings in the most recent fiscal year present in
// the dataset, because that is what answers "will they sponsor me, now".
// A company with 4,000 filings in FY2019 and 0 since is not a safe bet.
//
// tier is a stable machine value; the UI maps it to colour.
export const VERDICT_TIERS = ['strong', 'active', 'occasional', 'dormant', 'none', 'unknown'];

export function verdict(stats) {
  const s = stats || {};
  const recent = Number(s.recentCertified || 0);   // certified in latest FY in dataset
  const total = Number(s.totalCertified || 0);     // certified across all FYs loaded
  const years = Number(s.yearsWithFilings || 0);

  if (!s.found) {
    return {
      tier: 'unknown',
      label: 'No filing record',
      headline: 'No LCA filings found under this name',
      detail: 'This company has no certified LCA filings in the loaded DOL data. That usually means it does not sponsor — but it can also mean the legal entity files under a different name (a parent company, a staffing vendor, or a "Services" subsidiary). Search the parent company before ruling it out.',
      apply: 'caution'
    };
  }
  if (recent >= 100) {
    return {
      tier: 'strong',
      label: 'Strong sponsor',
      headline: 'Files at high volume, every year',
      detail: 'This employer files hundreds of LCAs a year. Sponsorship is a routine part of how it hires, and recruiters will not be surprised by the question.',
      apply: 'go'
    };
  }
  if (recent >= 20) {
    return {
      tier: 'active',
      label: 'Active sponsor',
      headline: 'Sponsors regularly',
      detail: 'A steady volume of recent filings. Sponsorship is established here, though it may be concentrated in specific teams or job families — check the roles below before you assume your role qualifies.',
      apply: 'go'
    };
  }
  if (recent >= 1) {
    return {
      tier: 'occasional',
      label: 'Occasional sponsor',
      headline: 'Sponsors, but rarely',
      detail: 'Only a handful of recent filings. This company can sponsor, but it is likely a case-by-case decision rather than a policy. Worth applying to — just do not build your plan around it, and expect to raise sponsorship early.',
      apply: 'maybe'
    };
  }
  if (total >= 1) {
    return {
      tier: 'dormant',
      label: 'Stopped filing',
      headline: years > 1 ? 'Sponsored before, but not recently' : 'Filed in an earlier year, nothing since',
      detail: 'There are older filings but none in the most recent year of data. Hiring freezes, a policy change, or a restructure all look like this. Treat it as unlikely unless the job posting says sponsorship is available.',
      apply: 'caution'
    };
  }
  return {
    tier: 'none',
    label: 'No certified filings',
    headline: 'Filed, but nothing was certified',
    detail: 'Filings exist but none were certified in the loaded data. This is rare and usually means withdrawn or denied applications. Do not rely on this employer for sponsorship.',
    apply: 'caution'
  };
}

// Shape the DB/sample row into the exact payload the page renders, so the
// verdict wording lives in one place instead of being duplicated client-side.
export function buildResult(row, opts) {
  const o = opts || {};
  if (!row) {
    return {
      found: false,
      query: o.query || '',
      verdict: verdict({ found: false }),
      source: o.source || 'db'
    };
  }
  const fy = row.fy_counts && typeof row.fy_counts === 'object' ? row.fy_counts : {};
  const filed = Object.keys(fy).map(Number).filter(y => isFinite(y)).sort((a, b) => a - b);
  const yearsWithFilings = filed.filter(y => Number(fy[y]) > 0).length;

  // fy_counts only carries years the employer actually filed in. Charting just
  // those would draw a single confident bar for a company that filed in 2023
  // and stopped — the exact opposite of the story. Fill the series through the
  // dataset's latest year so the zeroes are visible.
  const years = [];
  if (filed.length) {
    const last = Math.max(filed[filed.length - 1], Number(row.latest_fy) || 0);
    for (let y = filed[0]; y <= last; y++) years.push(y);
  }

  const v = verdict({
    found: true,
    recentCertified: row.latest_fy_certified,
    totalCertified: row.certified,
    yearsWithFilings
  });

  const denialShare = row.total_filings > 0
    ? (row.total_filings - row.certified) / row.total_filings
    : 0;

  return {
    found: true,
    query: o.query || '',
    source: o.source || 'db',
    employer: {
      name: row.employer_name,
      key: row.employer_key
    },
    verdict: v,
    stats: {
      latestFy: row.latest_fy,
      latestFyCertified: row.latest_fy_certified,
      totalCertified: row.certified,
      totalFilings: row.total_filings,
      yearsCovered: years,
      fyCounts: years.map(y => ({ fy: y, certified: Number(fy[y]) || 0 })),
      // Surfaced only when it is actually unusual — see the accuracy contract.
      denialFlag: denialShare > 0.1 ? Math.round(denialShare * 100) : null,
      wage: {
        p25: row.wage_p25 || null,
        median: row.wage_median || null,
        p75: row.wage_p75 || null
      },
      topStates: Array.isArray(row.top_states) ? row.top_states : []
    },
    roles: Array.isArray(row.roles) ? row.roles : []
  };
}
