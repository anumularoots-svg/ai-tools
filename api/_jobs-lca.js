// ============================================================================
// ZapKitt Jobs — LCA H1B Signal Enrichment
//
// Cross-references job company names with the DOL LCA database (Supabase)
// to determine actual H1B sponsorship history.
//
// This makes our H1B signal 10x more accurate than just reading job descriptions.
// A company that filed 500+ H1B petitions last year WILL sponsor again.
//
// Uses the existing ZapKitt Supabase connection (same DB as H1B Sponsor Check).
// ============================================================================

import { normalizeEmployer } from './_h1b.js';

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY || '';

function supabaseReady() {
  return !!(SUPABASE_URL && SUPABASE_KEY);
}

async function lookupLCA(employerKey) {
  if (!supabaseReady()) return null;
  try {
    const url = SUPABASE_URL + '/rest/v1/h1b_employers?select=employer_name,certified,latest_fy_certified,latest_fy,wage_median,top_states&limit=1&employer_key=eq.' + encodeURIComponent(employerKey);
    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json'
      }
    });
    if (!res.ok) return null;
    const rows = await res.json();
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  } catch (e) {
    return null;
  }
}

// ── H1B verdict from LCA data ────────────────────────────────────────────────
// Same logic as the H1B Sponsor Check tool — consistent across the platform.

export function lcaVerdict(lca) {
  if (!lca) return null;

  const certified = lca.certified || 0;
  const latestCertified = lca.latest_fy_certified || 0;

  // Stopped sponsoring — had filings before but zero last year
  if (certified > 10 && latestCertified === 0) {
    return {
      h1b_lca_status: 'STOPPED',
      h1b_lca_confidence: 0.85,
      h1b_lca_evidence: `${lca.employer_name} has not filed H1B LCA in ${lca.latest_fy}`,
      h1b_lca_filings: certified,
      h1b_lca_latest: latestCertified,
      h1b_lca_wage_median: lca.wage_median
    };
  }

  // Strong active sponsor
  if (latestCertified >= 100) {
    return {
      h1b_lca_status: 'STRONG_SPONSOR',
      h1b_lca_confidence: 0.97,
      h1b_lca_evidence: `${lca.employer_name} filed ${latestCertified} H1B LCA in ${lca.latest_fy} (${certified} total)`,
      h1b_lca_filings: certified,
      h1b_lca_latest: latestCertified,
      h1b_lca_wage_median: lca.wage_median
    };
  }

  // Active sponsor
  if (latestCertified >= 10) {
    return {
      h1b_lca_status: 'ACTIVE_SPONSOR',
      h1b_lca_confidence: 0.92,
      h1b_lca_evidence: `${lca.employer_name} filed ${latestCertified} H1B LCA in ${lca.latest_fy}`,
      h1b_lca_filings: certified,
      h1b_lca_latest: latestCertified,
      h1b_lca_wage_median: lca.wage_median
    };
  }

  // Occasional sponsor
  if (latestCertified >= 1) {
    return {
      h1b_lca_status: 'OCCASIONAL_SPONSOR',
      h1b_lca_confidence: 0.75,
      h1b_lca_evidence: `${lca.employer_name} filed ${latestCertified} H1B LCA in ${lca.latest_fy}`,
      h1b_lca_filings: certified,
      h1b_lca_latest: latestCertified,
      h1b_lca_wage_median: lca.wage_median
    };
  }

  return null;
}

// ── Enrich a batch of jobs with LCA data ─────────────────────────────────────

export async function enrichJobsWithLCA(jobs, log) {
  if (!supabaseReady()) {
    if (log) log('WARN', 'Supabase not configured — skipping LCA enrichment');
    return jobs;
  }

  // Deduplicate company lookups
  const companyKeys = new Map();
  for (const job of jobs) {
    if (!job.company_name) continue;
    const key = normalizeEmployer(job.company_name);
    if (!companyKeys.has(key)) {
      companyKeys.set(key, null);
    }
  }

  // Batch lookup LCA data
  let lookupCount = 0;
  for (const [key] of companyKeys) {
    const lca = await lookupLCA(key);
    companyKeys.set(key, lca);
    lookupCount++;
    // Small delay to avoid Supabase rate limits
    if (lookupCount % 10 === 0) {
      await new Promise(r => setTimeout(r, 100));
    }
  }

  const enriched = [];
  let matchCount = 0;

  for (const job of jobs) {
    if (!job.company_name) { enriched.push(job); continue; }

    const key = normalizeEmployer(job.company_name);
    const lca = companyKeys.get(key);
    const verdict = lcaVerdict(lca);

    if (verdict) {
      matchCount++;
      // Override or enhance H1B status based on LCA data
      const enhanced = { ...job };

      // Only upgrade, never downgrade job description signals
      if (verdict.h1b_lca_status === 'STRONG_SPONSOR' || verdict.h1b_lca_status === 'ACTIVE_SPONSOR') {
        // Company definitely sponsors — mark as EXPLICIT if not already
        if (enhanced.h1b_status !== 'EXPLICIT') {
          enhanced.h1b_status = 'EXPLICIT';
          enhanced.h1b_confidence = verdict.h1b_lca_confidence;
          enhanced.h1b_evidence = verdict.h1b_lca_evidence;
        }
        if (enhanced.sponsorship_status !== 'EXPLICIT') {
          enhanced.sponsorship_status = 'EXPLICIT';
          enhanced.sponsorship_confidence = verdict.h1b_lca_confidence;
          enhanced.sponsorship_evidence = verdict.h1b_lca_evidence;
        }
      }

      if (verdict.h1b_lca_status === 'STOPPED') {
        // Company stopped sponsoring — mark as NOT_SUPPORTED if currently UNKNOWN
        if (enhanced.h1b_status === 'UNKNOWN') {
          enhanced.h1b_status = 'NOT_SUPPORTED';
          enhanced.h1b_confidence = verdict.h1b_lca_confidence;
          enhanced.h1b_evidence = verdict.h1b_lca_evidence;
        }
      }

      // Always add LCA metadata
      enhanced.h1b_lca_status = verdict.h1b_lca_status;
      enhanced.h1b_lca_filings = verdict.h1b_lca_filings;
      enhanced.h1b_lca_latest = verdict.h1b_lca_latest;
      enhanced.h1b_lca_wage_median = verdict.h1b_lca_wage_median;
      enhanced.h1b_lca_evidence = verdict.h1b_lca_evidence;

      enriched.push(enhanced);
    } else {
      enriched.push(job);
    }
  }

  if (log) log('INFO', `LCA enrichment: ${matchCount}/${jobs.length} companies matched in DOL database`);
  return enriched;
}

export { supabaseReady };
