// ============================================================================
// ZapKitt Jobs V1 — Lever public job board collector
//
// Lever exposes public job boards at:
//   https://api.lever.co/v0/postings/{board_id}?mode=json
// No authentication required. This is their official public API.
// ============================================================================
import { LEVER_COMPANIES, IT_DEPARTMENT_KEYWORDS } from './_jobs-companies.js';
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

function isITJob(title, team) {
  const text = ((title || '') + ' ' + (team || '')).toLowerCase();
  return IT_DEPARTMENT_KEYWORDS.some(kw => text.includes(kw));
}

function parseLocation(locStr) {
  const name = clean(locStr || '');
  const city = clean(name.split(',')[0] || '');
  const state = clean(name.split(',')[1] || '');
  const isUS = /\b(us|usa|united states|u\.s\.)/i.test(name) ||
    /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/.test(state) ||
    /\b(San Francisco|New York|Seattle|Austin|Chicago|Boston|Denver|Atlanta|Dallas|Houston|Miami|Portland|Los Angeles|San Diego|San Jose|Palo Alto|Mountain View|Sunnyvale|Menlo Park)\b/i.test(name);
  return { raw: name, city, state, country: isUS ? 'US' : '', isUS };
}

function normalizeLeverJob(item, company) {
  const title = clean(item.text || '');
  const categories = item.categories || {};
  const loc = parseLocation(categories.location || '');
  const team = clean(categories.team || '');
  const commitment = clean(categories.commitment || '');

  // Lever description is split into lists
  let desc = '';
  if (item.descriptionPlain) {
    desc = clean(item.descriptionPlain);
  } else if (Array.isArray(item.lists)) {
    desc = item.lists.map(l => {
      const header = clean(l.text || '');
      const items = (l.content || '').replace(/<[^>]+>/g, '\n').trim();
      return header + '\n' + items;
    }).join('\n\n');
  }
  if (item.additionalPlain) {
    desc += '\n\n' + clean(item.additionalPlain);
  }

  const applyUrl = clean(item.applyUrl || item.hostedUrl || '');
  const postedAt = item.createdAt ? new Date(item.createdAt).toISOString() : null;

  return {
    source: 'lever',
    external_id: 'lv-' + (item.id || ''),
    source_url: clean(item.hostedUrl || applyUrl),
    apply_url: applyUrl,
    company_name: company.name,
    company_domain: company.board_id + '.lever.co',
    title,
    description: desc,
    location_raw: loc.raw,
    city: loc.city,
    state: loc.state,
    country: loc.country || 'US',
    remote_type: null,
    employment_type: commitment,
    experience_min: null,
    experience_max: null,
    salary_min: null,
    salary_max: null,
    salary_currency: 'USD',
    skills: null,
    posted_at: postedAt,
    job_hash: jobHash(company.name, title, loc.raw, desc)
  };
}

export async function fetchLeverJobs(log) {
  const allJobs = [];
  const seenIds = new Set();
  let companiesFetched = 0;
  let companiesErrored = 0;

  for (const company of LEVER_COMPANIES) {
    try {
      const url = `https://api.lever.co/v0/postings/${company.board_id}?mode=json`;
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'ZapKitt/1.0 (career-tools)' }
      });

      if (!resp.ok) {
        if (resp.status === 404) continue; // board doesn't exist
        log('WARN', `Lever ${company.name}: ${resp.status}`);
        companiesErrored++;
        if (resp.status === 429) {
          log('WARN', 'Lever rate limit, pausing');
          await new Promise(r => setTimeout(r, 5000));
        }
        continue;
      }

      const jobs = await resp.json();
      if (!Array.isArray(jobs)) continue;
      companiesFetched++;

      let itCount = 0;
      for (const item of jobs) {
        const categories = item.categories || {};
        const title = clean(item.text || '');
        const team = clean(categories.team || '');

        // Filter to IT/tech jobs
        if (!isITJob(title, team)) continue;

        // Filter to US-based or remote
        const loc = parseLocation(categories.location || '');
        if (!loc.isUS && !/remote/i.test(categories.location || '')) continue;

        const extId = 'lv-' + item.id;
        if (seenIds.has(extId)) continue;
        seenIds.add(extId);

        const job = normalizeLeverJob(item, company);
        allJobs.push(job);
        itCount++;
      }

      if (itCount > 0) {
        log('INFO', `Lever "${company.name}": ${itCount} IT jobs`);
      }

      // Respectful delay
      await new Promise(r => setTimeout(r, 300));

    } catch (e) {
      log('WARN', `Lever ${company.name} failed: ${e.message}`);
      companiesErrored++;
    }
  }

  log('INFO', `Lever total: ${allJobs.length} IT jobs from ${companiesFetched} companies (${companiesErrored} errors)`);
  return allJobs;
}
