#!/usr/bin/env node
// ============================================================================
// ZapKitt — check the live site against the fix list.
//
//   node scripts/status.mjs                  # check production
//   node scripts/status.mjs --local          # check http://localhost:4599
//
// Why this exists: the fix list has been re-audited several times from stale
// snapshots, and work that was already deployed got queued again. This asks
// zapkitt.com directly, so the answer is never a memory of the answer.
//
// Every check is a fact about the live HTML or a live API response. Add a row
// when a fix ships; nothing here should assert something it cannot observe.
// ============================================================================

const BASE = process.argv.includes('--local') ? 'http://localhost:4599' : 'https://zapkitt.com';

const CAREER_NAV = ['/ats-checker', '/ai-resume-builder', '/ai-mock-interview', '/ai-cold-email'];
const NAV_CONTAINER = /class="(?:zk-nav-links|nl|fp-nav-links|nav-links)"[^>]*>([\s\S]{0,600}?)<\/div>/;

const pages = {};
async function page(p) {
  if (!(p in pages)) {
    const r = await fetch(BASE + p);
    pages[p] = r.ok ? await r.text() : '';
    if (!r.ok) pages[p] = '';
  }
  return pages[p];
}

function navLinks(html) {
  const m = html.replace(/\n/g, '').match(NAV_CONTAINER);
  if (!m) return null;
  // Deduped: the "Get started" CTA repeats a tool href, and that is allowed to
  // vary per page. Comparing unique sorted hrefs answers "is it the same nav"
  // without tripping over the button.
  const hrefs = [...m[1].matchAll(/href="(\/[a-z0-9-]*)"/g)].map(x => x[1]).filter(h => h !== '/');
  return [...new Set(hrefs)].sort();
}


// Each check returns { ok, detail }.
const CHECKS = [
  ['nav is identical everywhere', async () => {
    const paths = ['/', '/ats-checker', '/ai-resume-builder', '/about', '/blog', '/ai-cold-email', '/ai-mock-interview', '/all-tools'];
    const sets = new Map();
    for (const p of paths) {
      const links = navLinks(await page(p));
      if (!links) return { ok: false, detail: 'no nav container found on ' + p };
      const key = links.join(',');
      if (!sets.has(key)) sets.set(key, []);
      sets.get(key).push(p);
    }
    if (sets.size === 1) return { ok: true, detail: 'one nav across ' + paths.length + ' pages' };
    const detail = [...sets.entries()].map(([k, ps]) => ps.join('+') + ' => ' + k).join(' || ');
    return { ok: false, detail: sets.size + ' distinct: ' + detail };
  }],

  ['nav shows only working tools', async () => {
    const links = navLinks(await page('/')) || [];
    const tools = links.filter(l => l !== '/');
    const bad = tools.filter(l => !CAREER_NAV.includes(l));
    return { ok: bad.length === 0, detail: bad.length ? 'unexpected: ' + bad.join(' ') : tools.join(' ') };
  }],

  ['H-1B checker is hidden until data is loaded', async () => {
    const homepage = await page('/');
    const sitemap = await page('/sitemap.xml');
    const linked = homepage.includes('h1b-sponsor-check');
    const indexed = sitemap.includes('h1b-sponsor-check');
    return { ok: !linked && !indexed, detail: linked ? 'still linked from homepage' : indexed ? 'still in sitemap' : 'unlinked and de-indexed' };
  }],

  ['H-1B page never serves sample figures', async () => {
    const r = await fetch(BASE + '/api/sponsor?company=Deloitte');
    const body = await r.text();
    if (r.status === 503) return { ok: true, detail: '503 — data not loaded, no fake numbers' };
    if (body.includes('"source":"sample"')) return { ok: false, detail: 'SERVING SAMPLE DATA — unset H1B_SAMPLE_DATA' };
    if (r.ok && body.includes('"source":"db"')) return { ok: true, detail: 'live DOL data — time to re-launch it in the nav' };
    return { ok: false, detail: 'unexpected: HTTP ' + r.status };
  }],

  ['About describes the career product', async () => {
    const h = await page('/about');
    const stale = ['140+', 'compress PDF', 'QR code', 'never leave your device'].filter(s => h.includes(s));
    return { ok: stale.length === 0, detail: stale.length ? 'stale copy: ' + stale.join(', ') : 'clean' };
  }],

  ['referral writer is a career tool', async () => {
    const h = await page('/ai-cold-email');
    const sales = ['Propose partnership', 'Offer a demo', 'freelance services'].filter(s => h.includes(s));
    const hasReferral = h.includes('Ask for a referral');
    return { ok: sales.length === 0 && hasReferral, detail: sales.length ? 'sales goals present: ' + sales.join(', ') : 'referral goals present' };
  }],

  ['no UPI anywhere', async () => {
    const hits = [];
    for (const p of ['/ai-resume-builder', '/ai-mock-interview', '/']) {
      const h = await page(p);
      if (/upi:\/\/|9985933964/.test(h)) hits.push(p);
    }
    return { ok: hits.length === 0, detail: hits.length ? hits.join(' ') : 'clean' };
  }],

  ['no "Made in India" / tool-directory identity', async () => {
    const hits = [];
    for (const p of ['/', '/ats-checker', '/about']) {
      const h = await page(p);
      if (/Made in India|Free online tools/.test(h)) hits.push(p);
    }
    return { ok: hits.length === 0, detail: hits.length ? hits.join(' ') : 'clean' };
  }],

  ['no fabricated usage metrics', async () => {
    // Test for the rendered element, not for prose. Searching for the counter's
    // wording matched the source comment explaining why it was removed, and no
    // regex comment-stripper survives a comment that contains quote marks.
    const bad = [];
    for (const p of ['/ai-mock-interview', '/']) {
      const h = await page(p);
      if (/id="liveCount"/.test(h)) bad.push(p + ' has the counter element');
      // A hard-coded usage claim inside a rendered tag, e.g. >1,200+ resumes optimized<
      if (/>[^<]*\b\d[\d,]{2,}\+?\s*(?:resumes optimi[sz]ed|students helped|interviews completed)/i.test(h))
        bad.push(p + ' states a usage figure');
    }
    return { ok: bad.length === 0, detail: bad.length ? bad.join('; ') : 'none' };
  }],

  ['resume builder leads with US employers', async () => {
    const h = await page('/ai-resume-builder');
    const groups = [...h.matchAll(/<optgroup label="([^"]*)"/g)].map(m => m[1]);
    const firstIsUS = /US tech/i.test(groups[0] || '');
    const indiaLast = groups.findIndex(g => /India-based/i.test(g)) === groups.length - 2; // "Other" is last
    return { ok: firstIsUS, detail: 'first group: ' + (groups[0] || 'none') + (indiaLast ? ', India-based near last' : '') };
  }],

  ['phone defaults to +1, not +91', async () => {
    const hits = [];
    for (const p of ['/ai-resume-builder', '/ai-mock-interview']) {
      const h = await page(p);
      // First option inside any country-code select decides the default.
      for (const m of h.matchAll(/<select[^>]*(?:countryCode|fbCountry)[^>]*>\s*<option value="([^"]*)"/g)) {
        if (m[1] !== '+1') hits.push(p + ' defaults to ' + m[1]);
      }
    }
    return { ok: hits.length === 0, detail: hits.length ? hits.join('; ') : 'both default to +1' };
  }],

  ['interview prices match the Ko-fi tier thresholds', async () => {
    const h = await page('/ai-mock-interview');
    const prices = [...h.matchAll(/<div class="price">\$(\d+)/g)].map(m => Number(m[1]));
    // api/kofi.js grants r2 at >= 5 and r3 at >= 9. A price below its own
    // threshold under-pays; a price at or above the NEXT tier over-grants.
    const ok = prices.length === 2 && prices[0] === 5 && prices[1] === 9;
    return { ok, detail: 'page prices $' + prices.join(' / $') + ' vs thresholds $5 / $9' };
  }],

  ['paid unlocks can actually be paid for', async () => {
    const r = await fetch(BASE + '/api/kofi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(JSON.stringify({ email: 'status-check@example.com', amount: '9', verification_token: 'deliberately-wrong' }))
    });
    if (r.status === 503) return { ok: false, detail: 'KOFI_VERIFICATION_TOKEN not set — nothing can be paid for' };
    if (r.status === 401) return { ok: true, detail: 'token configured and enforced (bad token rejected)' };
    return { ok: false, detail: 'HTTP ' + r.status + ' — expected 401 for a bad token' };
  }],

  ['all four tools respond', async () => {
    const bad = [];
    for (const p of CAREER_NAV) {
      const r = await fetch(BASE + p);
      if (!r.ok) bad.push(p + ' ' + r.status);
    }
    return { ok: bad.length === 0, detail: bad.length ? bad.join(', ') : '4/4 serving 200' };
  }]
];

const PENDING = [
  ['H-1B: load the DOL dataset', 'db/README.md steps 2-4. Pipeline is built and tested.'],
  ['Ko-fi: set KOFI_VERIFICATION_TOKEN', 'Ko-fi > Settings > Webhooks/API. Restores $5/$9 payments.'],
  ['Blog: 10 generic AI-tool listicles', 'Unlink rather than delete — they carry search traffic.'],
  ['Interview testimonials', 'Confirm Rahul M. / Sneha K. / Aditya P. are real, or remove.'],
  ['User accounts', 'Not built. Blocks the webhook handler and the $49/mo plan.'],
  ['Homepage social proof', 'Needs real analytics figures. Do not invent them.']
];

console.log('\nZapKitt status — ' + BASE + '\n');
let pass = 0, fail = 0;
for (const [name, fn] of CHECKS) {
  let res;
  try { res = await fn(); } catch (e) { res = { ok: false, detail: 'check threw: ' + e.message }; }
  if (res.ok) pass++; else fail++;
  console.log('  ' + (res.ok ? 'PASS' : 'FAIL') + '  ' + name.padEnd(46) + res.detail);
}
console.log('\n  ' + pass + ' passing, ' + fail + ' failing\n');

console.log('Known outstanding work (not auto-checkable):');
for (const [what, how] of PENDING) console.log('  - ' + what + '\n      ' + how);
console.log('');
process.exit(fail ? 1 : 0);
