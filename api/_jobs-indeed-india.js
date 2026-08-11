// ============================================================================
// ZapKitt India Jobs — Indeed RSS collector for fresher IT jobs
//
// Indeed provides official public RSS feeds — no ToS violation.
// These are meant to be consumed by job aggregators.
// ============================================================================
import { jobHash } from './_jobs-source.js';

// Indeed India RSS feeds — fresher IT jobs by city + skill
const INDEED_RSS_FEEDS = [
  // By city + fresher
  { url: 'https://in.indeed.com/rss?q=fresher+software+engineer&l=Hyderabad&sort=date', city: 'Hyderabad' },
  { url: 'https://in.indeed.com/rss?q=fresher+software+developer&l=Hyderabad&sort=date', city: 'Hyderabad' },
  { url: 'https://in.indeed.com/rss?q=fresher+software+engineer&l=Bangalore&sort=date', city: 'Bangalore' },
  { url: 'https://in.indeed.com/rss?q=fresher+software+developer&l=Bangalore&sort=date', city: 'Bangalore' },
  { url: 'https://in.indeed.com/rss?q=fresher+software+engineer&l=Chennai&sort=date', city: 'Chennai' },
  { url: 'https://in.indeed.com/rss?q=fresher+software+developer&l=Pune&sort=date', city: 'Pune' },
  { url: 'https://in.indeed.com/rss?q=fresher+software+engineer&l=Mumbai&sort=date', city: 'Mumbai' },
  { url: 'https://in.indeed.com/rss?q=fresher+software+engineer&l=Noida&sort=date', city: 'Noida' },

  // By skill + fresher
  { url: 'https://in.indeed.com/rss?q=fresher+java+developer&l=India&sort=date', city: 'India' },
  { url: 'https://in.indeed.com/rss?q=fresher+python+developer&l=India&sort=date', city: 'India' },
  { url: 'https://in.indeed.com/rss?q=fresher+react+developer&l=India&sort=date', city: 'India' },
  { url: 'https://in.indeed.com/rss?q=fresher+full+stack+developer&l=India&sort=date', city: 'India' },
  { url: 'https://in.indeed.com/rss?q=fresher+devops+engineer&l=India&sort=date', city: 'India' },
  { url: 'https://in.indeed.com/rss?q=fresher+data+analyst&l=India&sort=date', city: 'India' },
  { url: 'https://in.indeed.com/rss?q=fresher+qa+engineer&l=India&sort=date', city: 'India' },
  { url: 'https://in.indeed.com/rss?q=fresher+testing+engineer&l=India&sort=date', city: 'India' },
  { url: 'https://in.indeed.com/rss?q=fresher+dot+net+developer&l=India&sort=date', city: 'India' },
  { url: 'https://in.indeed.com/rss?q=graduate+trainee+software&l=India&sort=date', city: 'India' },
  { url: 'https://in.indeed.com/rss?q=entry+level+software+engineer&l=India&sort=date', city: 'India' },
  { url: 'https://in.indeed.com/rss?q=junior+software+engineer&l=India&sort=date', city: 'India' },

  // WFH / Remote freshers
  { url: 'https://in.indeed.com/rss?q=fresher+software+engineer+remote&l=India&sort=date', city: 'Remote' },
  { url: 'https://in.indeed.com/rss?q=fresher+work+from+home+software&l=India&sort=date', city: 'Remote' },
];

function parseXML(xml) {
  // Simple RSS XML parser — extract items
  const items = [];
  const itemMatches = xml.match(/<item>([\s\S]*?)<\/item>/gi);
  if (!itemMatches) return items;

  for (const item of itemMatches) {
    const get = (tag) => {
      const m = item.match(new RegExp('<' + tag + '[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/' + tag + '>')) ||
                item.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)<\\/' + tag + '>'));
      return m ? m[1].trim() : '';
    };

    items.push({
      title: get('title'),
      link: get('link'),
      description: get('description'),
      pubDate: get('pubDate'),
      guid: get('guid'),
      source: get('source'),
    });
  }
  return items;
}

function cleanDescription(html) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n').trim();
}

function extractCity(title, description, defaultCity) {
  const text = (title + ' ' + description).toLowerCase();
  if (/hyderabad/i.test(text)) return 'Hyderabad';
  if (/bangalore|bengaluru/i.test(text)) return 'Bangalore';
  if (/chennai/i.test(text)) return 'Chennai';
  if (/pune/i.test(text)) return 'Pune';
  if (/mumbai/i.test(text)) return 'Mumbai';
  if (/noida/i.test(text)) return 'Noida';
  if (/gurugram|gurgaon/i.test(text)) return 'Gurugram';
  if (/delhi/i.test(text)) return 'Delhi';
  if (/kolkata/i.test(text)) return 'Kolkata';
  if (/remote|work from home|wfh/i.test(text)) return 'Remote';
  return defaultCity || 'India';
}

function extractCompany(title, description) {
  // Try to extract company from Indeed description
  const m = description.match(/(?:company|employer|organization)[:\s]+([A-Za-z0-9\s&.,'-]+?)(?:\n|<|$)/i);
  if (m) return m[1].trim().slice(0, 60);

  // Try from title format "Job Title - Company Name"
  const parts = title.split(' - ');
  if (parts.length >= 2) return parts[parts.length - 1].trim().slice(0, 60);

  return 'Unknown Company';
}

function isRemote(title, description) {
  return /remote|work from home|wfh/i.test(title + ' ' + description);
}

function normalizeIndeedJob(item, defaultCity) {
  const title = item.title.replace(/\s*-\s*.*$/, '').trim(); // Remove company from title
  const desc = cleanDescription(item.description);
  const company = extractCompany(item.title, desc);
  const city = extractCity(item.title, desc, defaultCity);
  const remote = isRemote(item.title, desc);

  // Extract Indeed job ID from URL/guid
  const idMatch = (item.guid || item.link || '').match(/jk=([a-f0-9]+)/i);
  const externalId = 'indeed-in-' + (idMatch ? idMatch[1] : Math.random().toString(36).slice(2));

  const postedAt = item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString();

  return {
    source: 'indeed_india',
    external_id: externalId,
    source_url: item.link || '',
    apply_url: item.link || '',
    company_name: company,
    company_domain: 'in.indeed.com',
    title: title,
    description: desc,
    location_raw: city === 'Remote' ? 'Remote - India' : city + ', India',
    city: city,
    state: '',
    country: 'IN',
    remote_type: remote ? 'REMOTE_GLOBAL' : 'ONSITE',
    employment_type: 'Full-time',
    experience_min: 0,
    experience_max: 2,
    salary_min: null,
    salary_max: null,
    salary_currency: 'INR',
    skills: null,
    posted_at: postedAt,
    job_hash: jobHash('indeed_IN_' + company, title, city, desc.slice(0, 200)),
    is_fresher: true
  };
}

export async function fetchIndeedIndiaJobs(log) {
  const allJobs = [];
  const seenIds = new Set();
  let feedsFetched = 0, feedsErrored = 0;

  for (const feed of INDEED_RSS_FEEDS) {
    try {
      const resp = await fetch(feed.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ZapKitt/1.0; +https://zapkitt.com)',
          'Accept': 'application/rss+xml, application/xml, text/xml'
        }
      });

      if (!resp.ok) {
        log('WARN', `Indeed RSS ${feed.city}: ${resp.status}`);
        feedsErrored++;
        await new Promise(r => setTimeout(r, 500));
        continue;
      }

      const xml = await resp.text();
      const items = parseXML(xml);
      feedsFetched++;
      let count = 0;

      for (const item of items) {
        if (!item.title || !item.link) continue;

        const job = normalizeIndeedJob(item, feed.city);

        if (seenIds.has(job.external_id)) continue;
        seenIds.add(job.external_id);

        allJobs.push(job);
        count++;
      }

      if (count > 0) log('INFO', `Indeed ${feed.city}: ${count} jobs`);

      // Respectful delay between requests
      await new Promise(r => setTimeout(r, 400));

    } catch (e) {
      log('WARN', `Indeed RSS ${feed.city} failed: ${e.message}`);
      feedsErrored++;
    }
  }

  log('INFO', `Indeed India total: ${allJobs.length} fresher jobs from ${feedsFetched} feeds`);
  return allJobs;
}
