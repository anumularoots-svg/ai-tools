// ============================================================================
// ZapKitt India Jobs — Adzuna API collector for India fresher IT jobs
//
// Adzuna is a legitimate job aggregator with a free API tier.
// Free: 100 calls/day, India country code: "in"
// Docs: https://developer.adzuna.com/docs/search
// ============================================================================
import { jobHash } from './_jobs-source.js';

const ADZUNA_BASE = 'https://api.adzuna.com/v1/api/jobs/in/search';

// Fresher IT search queries for India
const ADZUNA_SEARCHES = [
  { what: 'fresher software engineer', where: 'Hyderabad' },
  { what: 'fresher software developer', where: 'Hyderabad' },
  { what: 'fresher java developer', where: 'Hyderabad' },
  { what: 'fresher software engineer', where: 'Bangalore' },
  { what: 'fresher python developer', where: 'Bangalore' },
  { what: 'fresher software engineer', where: 'Chennai' },
  { what: 'fresher software engineer', where: 'Pune' },
  { what: 'entry level software engineer', where: 'India' },
  { what: 'junior software engineer', where: 'India' },
  { what: 'graduate trainee software', where: 'India' },
  { what: 'fresher react developer', where: 'India' },
  { what: 'fresher full stack developer', where: 'India' },
  { what: 'fresher devops engineer', where: 'India' },
  { what: 'fresher data analyst', where: 'India' },
  { what: 'fresher qa engineer', where: 'India' },
  { what: 'fresher testing engineer', where: 'India' },
  { what: 'fresher dot net developer', where: 'India' },
  { what: 'fresher android developer', where: 'India' },
  { what: 'work from home fresher software', where: 'India' },
  { what: 'remote fresher software engineer', where: 'India' },
];

function clean(s) { return s ? String(s).trim() : ''; }

function extractCity(locationObj) {
  if (!locationObj) return 'India';
  const display = clean(locationObj.display_name || '');
  const area = clean((locationObj.area || []).join(', '));
  const text = display || area;

  if (/hyderabad/i.test(text)) return 'Hyderabad';
  if (/bangalore|bengaluru/i.test(text)) return 'Bangalore';
  if (/chennai/i.test(text)) return 'Chennai';
  if (/pune/i.test(text)) return 'Pune';
  if (/mumbai/i.test(text)) return 'Mumbai';
  if (/noida/i.test(text)) return 'Noida';
  if (/gurugram|gurgaon/i.test(text)) return 'Gurugram';
  if (/delhi/i.test(text)) return 'Delhi';
  if (/kolkata/i.test(text)) return 'Kolkata';
  if (/remote|work from home/i.test(text)) return 'Remote';
  return clean(text.split(',')[0]) || 'India';
}

function normalizeAdzunaJob(item) {
  const title = clean(item.title || '');
  const company = clean(item.company?.display_name || 'Unknown Company');
  const city = extractCity(item.location);
  const desc = clean(item.description || '');
  const applyUrl = clean(item.redirect_url || '');
  const isRemote = /remote|work from home|wfh/i.test(title + ' ' + desc + ' ' + city);

  return {
    source: 'adzuna_india',
    external_id: 'adz-in-' + (item.id || ''),
    source_url: applyUrl,
    apply_url: applyUrl,
    company_name: company,
    company_domain: 'adzuna.in',
    title,
    description: desc,
    location_raw: city === 'Remote' ? 'Remote - India' : city + ', India',
    city,
    state: '',
    country: 'IN',
    remote_type: isRemote ? 'REMOTE_GLOBAL' : 'ONSITE',
    employment_type: clean(item.contract_time || 'Full-time'),
    experience_min: 0,
    experience_max: 2,
    salary_min: item.salary_min ? Math.round(item.salary_min) : null,
    salary_max: item.salary_max ? Math.round(item.salary_max) : null,
    salary_currency: 'INR',
    skills: null,
    posted_at: item.created ? new Date(item.created).toISOString() : new Date().toISOString(),
    job_hash: jobHash('adzuna_IN_' + company, title, city, desc.slice(0, 200))
  };
}

export async function fetchAdzunaIndiaJobs(log) {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;

  if (!appId || !appKey) {
    log('ERROR', 'ADZUNA_APP_ID or ADZUNA_APP_KEY not configured');
    return [];
  }

  const allJobs = [];
  const seenIds = new Set();
  let feedsFetched = 0, feedsErrored = 0;

  // Limit searches to stay within 100 calls/day free tier
  // Use first 15 searches per run
  const searches = ADZUNA_SEARCHES.slice(0, 15);

  for (const search of searches) {
    try {
      const params = new URLSearchParams({
        app_id: appId,
        app_key: appKey,
        results_per_page: '10',
        what: search.what,
        where: search.where,
        sort_by: 'date',
        max_days_old: '3', // Only last 3 days
        content_type: 'application/json'
      });

      const url = `${ADZUNA_BASE}/1?${params.toString()}`;
      const resp = await fetch(url, {
        headers: { 'Accept': 'application/json' }
      });

      if (!resp.ok) {
        log('WARN', `Adzuna "${search.what}" ${search.where}: ${resp.status}`);
        feedsErrored++;
        if (resp.status === 429) {
          log('WARN', 'Adzuna rate limit hit — stopping');
          break;
        }
        continue;
      }

      const data = await resp.json();
      const jobs = data.results || [];
      feedsFetched++;
      let count = 0;

      for (const item of jobs) {
        const extId = 'adz-in-' + item.id;
        if (seenIds.has(extId)) continue;
        seenIds.add(extId);

        const job = normalizeAdzunaJob(item);
        allJobs.push(job);
        count++;
      }

      if (count > 0) log('INFO', `Adzuna "${search.what}" ${search.where}: ${count} jobs`);

      // Respectful delay — stay within rate limits
      await new Promise(r => setTimeout(r, 300));

    } catch (e) {
      log('WARN', `Adzuna "${search.what}" failed: ${e.message}`);
      feedsErrored++;
    }
  }

  log('INFO', `Adzuna India total: ${allJobs.length} fresher jobs from ${feedsFetched} searches`);
  return allJobs;
}
