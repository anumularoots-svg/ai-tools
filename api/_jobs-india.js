// ============================================================================
// ZapKitt India Jobs — Greenhouse collector for India fresher IT jobs
// ============================================================================
import { INDIA_GREENHOUSE_COMPANIES, IT_DEPARTMENT_KEYWORDS, FRESHER_KEYWORDS } from './_jobs-companies.js';
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
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n').trim();
}

function isITJob(title, departments) {
  const text = ((title || '') + ' ' + (departments || []).join(' ')).toLowerCase();
  return IT_DEPARTMENT_KEYWORDS.some(kw => text.includes(kw));
}

function isFresherJob(title, description) {
  const text = ((title || '') + ' ' + (description || '')).toLowerCase();
  return FRESHER_KEYWORDS.some(kw => text.includes(kw));
}

function isIndiaLocation(loc) {
  if (!loc) return false;
  const name = loc.toLowerCase();
  return name.includes('india') || name.includes('bangalore') ||
    name.includes('bengaluru') || name.includes('hyderabad') ||
    name.includes('chennai') || name.includes('pune') ||
    name.includes('mumbai') || name.includes('delhi') ||
    name.includes('noida') || name.includes('gurugram') ||
    name.includes('gurgaon') || name.includes('kolkata') ||
    name.includes('remote') || name.includes('work from home');
}

function parseIndiaLocation(loc) {
  const name = clean(loc?.name || '');
  const city = clean(name.split(',')[0] || '');
  return { raw: name, city, state: '', country: 'IN' };
}

function normalizeIndiaJob(item, company) {
  const title = clean(item.title || '');
  const loc = parseIndiaLocation(item.location);
  const desc = stripHTML(item.content || '');
  const applyUrl = clean(item.absolute_url || '');
  const postedAt = item.updated_at || item.created_at || null;

  return {
    source: 'greenhouse_india',
    external_id: 'gh-in-' + (item.id || ''),
    source_url: applyUrl,
    apply_url: applyUrl,
    company_name: company.name,
    company_domain: company.board_id + '.greenhouse.io',
    title,
    description: desc,
    location_raw: loc.raw,
    city: loc.city,
    state: '',
    country: 'IN',
    remote_type: /remote|work from home|wfh/i.test(loc.raw) ? 'REMOTE_GLOBAL' : 'ONSITE',
    employment_type: '',
    experience_min: 0,
    experience_max: 2,
    salary_min: null,
    salary_max: null,
    salary_currency: 'INR',
    skills: null,
    posted_at: postedAt ? new Date(postedAt).toISOString() : null,
    job_hash: jobHash(company.name + '_IN', title, loc.raw, desc),
    is_fresher: true
  };
}

export async function fetchIndiaGreenhouseJobs(log) {
  const allJobs = [];
  const seenIds = new Set();
  let companiesFetched = 0, companiesErrored = 0;

  for (const company of INDIA_GREENHOUSE_COMPANIES) {
    try {
      const url = `https://boards-api.greenhouse.io/v1/boards/${company.board_id}/jobs?content=true`;
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'ZapKitt/1.0 (career-tools)' }
      });

      if (!resp.ok) {
        if (resp.status === 404) continue;
        log('WARN', `India Greenhouse ${company.name}: ${resp.status}`);
        companiesErrored++;
        if (resp.status === 429) { await new Promise(r => setTimeout(r, 5000)); }
        continue;
      }

      const data = await resp.json();
      const jobs = data.jobs || [];
      companiesFetched++;
      let count = 0;

      for (const item of jobs) {
        const departments = (item.departments || []).map(d => d.name || '');
        const title = clean(item.title || '');
        const loc = item.location?.name || '';

        // Must be India location
        if (!isIndiaLocation(loc)) continue;

        // Must be IT job
        if (!isITJob(title, departments)) continue;

        const extId = 'gh-in-' + item.id;
        if (seenIds.has(extId)) continue;
        seenIds.add(extId);

        const job = normalizeIndiaJob(item, company);

        // Mark if fresher job
        job.is_fresher = isFresherJob(title, job.description);

        allJobs.push(job);
        count++;
      }

      if (count > 0) log('INFO', `India GH "${company.name}": ${count} jobs`);
      await new Promise(r => setTimeout(r, 150));

    } catch (e) {
      log('WARN', `India GH ${company.name} failed: ${e.message}`);
      companiesErrored++;
    }

    if (companiesFetched + companiesErrored >= 20) {
      log('INFO', 'India Greenhouse batch limit reached');
      break;
    }
  }

  log('INFO', `India total: ${allJobs.length} IT jobs from ${companiesFetched} companies`);
  return allJobs;
}
