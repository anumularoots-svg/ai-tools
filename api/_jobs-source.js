// ============================================================================
// ZapKitt Jobs V0.5 — Source abstraction + USAJOBS collector
//
// The source interface is simple: fetchJobs() → array of normalized jobs.
// Future sources (Lever, Greenhouse) implement the same shape.
// ============================================================================
import { IT_SEARCH_KEYWORDS, USAJOBS_BASE_URL, USAJOBS_MAX_PER_SEARCH } from './_jobs-config.js';
import { createHash } from 'crypto';

// ── Normalization helpers ───────────────────────────────────────────────────

function clean(s) { return s ? String(s).trim() : ''; }

function parseDate(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export function normalizeText(s) {
  return clean(s).toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

export function jobHash(company, title, location, description) {
  const input = [company, title, location].map(normalizeText).join('|') +
    '|' + normalizeText((description || '').slice(0, 500));
  return createHash('sha256').update(input).digest('hex').slice(0, 32);
}

// ── USAJOBS source ──────────────────────────────────────────────────────────

function parseUSAJobsLocation(locations) {
  if (!Array.isArray(locations) || !locations.length) return { raw: '', city: '', state: '', country: 'US' };
  const loc = locations[0];
  const raw = clean(loc.LocationName || '');
  const city = clean(loc.CityName || '');
  const state = clean(loc.CountrySubDivisionCode || '');
  return { raw, city, state, country: 'US' };
}

function normalizeUSAJob(item) {
  const p = item.MatchedObjectDescriptor || {};
  const pos = p.PositionLocation || [];
  const loc = parseUSAJobsLocation(pos);
  const salary = p.PositionRemuneration || [];
  let salaryMin = null, salaryMax = null;
  if (salary.length) {
    salaryMin = Number(salary[0].MinimumRange) || null;
    salaryMax = Number(salary[0].MaximumRange) || null;
  }
  const desc = clean(p.UserArea?.Content || p.QualificationSummary || '');
  const title = clean(p.PositionTitle || '');
  const company = clean(p.OrganizationName || p.DepartmentName || 'US Government');
  const applyUrl = clean(p.PositionURI || p.ApplyURI?.[0] || '');

  return {
    source: 'usajobs',
    external_id: clean(p.PositionID || ''),
    source_url: applyUrl,
    apply_url: applyUrl,
    company_name: company,
    company_domain: 'usajobs.gov',
    title: title,
    description: desc,
    location_raw: loc.raw,
    city: loc.city,
    state: loc.state,
    country: loc.country,
    remote_type: null, // classified later by rules
    employment_type: clean(p.PositionSchedule?.[0]?.Name || ''),
    experience_min: null,
    experience_max: null,
    salary_min: salaryMin,
    salary_max: salaryMax,
    salary_currency: 'USD',
    skills: null, // extracted later by rules
    posted_at: parseDate(p.PositionStartDate || p.PublicationStartDate),
    job_hash: jobHash(company, title, loc.raw, desc)
  };
}

export async function fetchUSAJobs(log) {
  const apiKey = process.env.USAJOBS_API_KEY;
  const email = process.env.USAJOBS_USER_AGENT_EMAIL;
  if (!apiKey || !email) {
    log('ERROR', 'USAJOBS credentials not configured');
    return [];
  }

  const allJobs = [];
  const seenIds = new Set();
  const headers = {
    'Authorization-Key': apiKey,
    'User-Agent': email,
    'Host': 'data.usajobs.gov'
  };

  // Only fetch jobs posted in the last 2 days (daily cron, overlap for safety)
  const since = new Date();
  since.setDate(since.getDate() - 2);
  const dateFilter = since.toISOString().slice(0, 10);

  // Search a subset of keywords to stay within rate limits
  // USAJOBS allows 2000 requests/day on free API key
  const keywords = IT_SEARCH_KEYWORDS.slice(0, 20); // top 20 keywords per run

  for (const keyword of keywords) {
    try {
      const params = new URLSearchParams({
        Keyword: keyword,
        LocationName: 'United States',
        DatePosted: '2', // last 2 days
        ResultsPerPage: String(USAJOBS_MAX_PER_SEARCH),
        Page: '1',
        Fields: 'min' // reduce payload
      });

      const url = USAJOBS_BASE_URL + '?' + params.toString();
      const resp = await fetch(url, { headers });

      if (!resp.ok) {
        log('WARN', `USAJOBS ${resp.status} for "${keyword}"`);
        if (resp.status === 429) {
          log('WARN', 'USAJOBS rate limit hit, stopping');
          break;
        }
        continue;
      }

      const data = await resp.json();
      const items = data?.SearchResult?.SearchResultItems || [];
      log('INFO', `USAJOBS "${keyword}": ${items.length} results`);

      for (const item of items) {
        try {
          const job = normalizeUSAJob(item);
          if (!job.external_id || seenIds.has(job.external_id)) continue;
          seenIds.add(job.external_id);
          allJobs.push(job);
        } catch (e) {
          log('WARN', `Failed to normalize job: ${e.message}`);
        }
      }

      // Small delay between requests to be respectful
      await new Promise(r => setTimeout(r, 200));
    } catch (e) {
      log('ERROR', `USAJOBS fetch failed for "${keyword}": ${e.message}`);
    }
  }

  log('INFO', `USAJOBS total: ${allJobs.length} unique jobs`);
  return allJobs;
}
