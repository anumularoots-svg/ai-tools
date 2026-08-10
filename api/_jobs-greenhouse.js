// ============================================================================
// ZapKitt Jobs V1 — Greenhouse public job board collector
//
// Greenhouse exposes public job boards at:
//   https://boards-api.greenhouse.io/v1/boards/{board_id}/jobs
// No authentication required. This is their official public API.
// ============================================================================
import { GREENHOUSE_COMPANIES, IT_DEPARTMENT_KEYWORDS } from './_jobs-companies.js';
import { jobHash } from './_jobs-source.js';

function clean(s) { return s ? String(s).trim() : ''; }

function stripHTML(html) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isITJob(title, departments) {
  const text = ((title || '') + ' ' + (departments || []). join(' ')).toLowerCase();
  return IT_DEPARTMENT_KEYWORDS.some(kw => text.includes(kw));
}

function parseLocation(loc) {
  const name = clean(loc?.name || '');
  const city = clean(name.split(',')[0] || '');
  const state = clean(name.split(',')[1] || '');
  const isUS = /\b(us|usa|united states|u\.s\.)/i.test(name) ||
    /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/.test(state);
  return { raw: name, city, state, country: isUS ? 'US' : '', isUS };
}

function normalizeGreenhouseJob(item, company) {
  const title = clean(item.title || '');
  const loc = parseLocation(item.location);
  const departments = (item.departments || []).map(d => d.name || '');
  const desc = stripHTML(item.content || '');
  const applyUrl = clean(item.absolute_url || '');
  const postedAt = item.updated_at || item.created_at || null;

  return {
    source: 'greenhouse',
    external_id: 'gh-' + (item.id || ''),
    source_url: applyUrl,
    apply_url: applyUrl,
    company_name: company.name,
    company_domain: company.board_id + '.greenhouse.io',
    title,
    description: desc,
    location_raw: loc.raw,
    city: loc.city,
    state: loc.state,
    country: loc.country || 'US',
    remote_type: null,
    employment_type: '',
    experience_min: null,
    experience_max: null,
    salary_min: null,
    salary_max: null,
    salary_currency: 'USD',
    skills: null,
    posted_at: postedAt ? new Date(postedAt).toISOString() : null,
    job_hash: jobHash(company.name, title, loc.raw, desc)
  };
}

export async function fetchGreenhouseJobs(log) {
  const allJobs = [];
  const seenIds = new Set();
  let companiesFetched = 0;
  let companiesErrored = 0;

  for (const company of GREENHOUSE_COMPANIES) {
    try {
      const url = `https://boards-api.greenhouse.io/v1/boards/${company.board_id}/jobs?content=true`;
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'ZapKitt/1.0 (career-tools)' }
      });

      if (!resp.ok) {
        if (resp.status === 404) {
          // Board doesn't exist or is private — skip silently
          continue;
        }
        log('WARN', `Greenhouse ${company.name}: ${resp.status}`);
        companiesErrored++;
        if (resp.status === 429) {
          log('WARN', 'Greenhouse rate limit, pausing');
          await new Promise(r => setTimeout(r, 5000));
        }
        continue;
      }

      const data = await resp.json();
      const jobs = data.jobs || [];
      companiesFetched++;

      let itCount = 0;
      for (const item of jobs) {
        const departments = (item.departments || []).map(d => d.name || '');
        const title = clean(item.title || '');

        // Filter to IT/tech jobs and US-based
        if (!isITJob(title, departments)) continue;

        const loc = parseLocation(item.location);
        // Include US jobs and remote jobs
        if (!loc.isUS && !/remote/i.test(loc.raw)) continue;

        const extId = 'gh-' + item.id;
        if (seenIds.has(extId)) continue;
        seenIds.add(extId);

        const job = normalizeGreenhouseJob(item, company);
        allJobs.push(job);
        itCount++;
      }

      if (itCount > 0) {
        log('INFO', `Greenhouse "${company.name}": ${itCount} IT jobs`);
      }

      // Respectful delay between companies
      await new Promise(r => setTimeout(r, 100));

    } catch (e) {
      log('WARN', `Greenhouse ${company.name} failed: ${e.message}`);
      companiesErrored++;
    }

    // Stop after 20 companies per run to stay within serverless timeout
    if (companiesFetched + companiesErrored >= 20) {
      log('INFO', 'Greenhouse batch limit reached (20 companies)');
      break;
    }
  }

  log('INFO', `Greenhouse total: ${allJobs.length} IT jobs from ${companiesFetched} companies (${companiesErrored} errors)`);
  return allJobs;
}
