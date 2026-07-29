#!/usr/bin/env node
// ============================================================================
// ZapKitt — one nav, one footer identity, across every page.
//
// The site had grown four different navigations and three different footer
// taglines. A visitor moving from the homepage ("career tools for
// international students") to the About page ("140+ free online tools,
// compress PDF, QR codes") was reading two different companies. This puts the
// same links and the same one-line identity on every page.
//
// Deliberately NOT a markup rewrite: each page keeps its own nav/footer
// classes and CSS. Only the LINK LIST and the identity line are replaced.
// Swapping .nl for .zk-nav-links would break 28 pages that never load
// zapkitt-global.css.
//
// Usage:
//   node scripts/unify-chrome.mjs --check    # report only, change nothing
//   node scripts/unify-chrome.mjs            # apply
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';

const APPLY = !process.argv.includes('--check');

// Admin pages are internal and intentionally chrome-less.
const SKIP = new Set(['admin.html', 'admin-feedback.html']);

// ── The canonical nav ───────────────────────────────────────────────────────
// Career tools first, in funnel order. "All tools" stays last and
// de-emphasised: ~100 utility pages are real SEO surface and dropping the link
// entirely would orphan every one of them from site navigation.
const LINKS = [
  ['/h1b-sponsor-check', 'H-1B sponsors'],
  ['/ats-checker', 'ATS checker'],
  ['/ai-resume-builder', 'Resume'],
  ['/ai-mock-interview', 'Interview'],
  ['/ai-cold-email', 'Referral email'],
  ['/all-tools', 'All tools']
];

const navHtml = () => LINKS.map(([h, t]) => `<a href="${h}">${t}</a>`).join('');

// The one-line answer to "what is this site". Used in every footer.
const IDENTITY = 'AI career tools for international students job hunting in the US. Free to start.';
const COPYRIGHT = '© 2026 ZapKitt · Free AI career tools for international students.';

// ── Replacements ────────────────────────────────────────────────────────────
// Each entry: a regex over the whole file and what to put back. `label` is what
// gets reported, so a run that silently matches nothing is visible.
const RULES = [
  {
    label: 'nav .zk-nav-links',
    // Keep the trailing CTA button if the page has one.
    re: /(<div class="zk-nav-links"[^>]*>)([\s\S]*?)(<\/div>)/,
    fn: (m, open, inner, close) => {
      const cta = inner.match(/<a[^>]*class="zk-nav-cta"[^>]*>[\s\S]*?<\/a>/);
      return open + '\n  ' + navHtml() + '\n  ' + (cta ? cta[0] : '') + '\n' + close;
    }
  },
  { label: 'nav .nl', re: /(<div class="nl">)([\s\S]*?)(<\/div>)/, fn: (m, o, i, c) => o + navHtml() + c },
  { label: 'nav .fp-nav-links', re: /(<div class="fp-nav-links">)([\s\S]*?)(<\/div>)/, fn: (m, o, i, c) => o + navHtml() + c },
  { label: 'nav .nav-links', re: /(<div class="nav-links">)([\s\S]*?)(<\/div>)/, fn: (m, o, i, c) => o + navHtml() + c },

  // ── Footer identity ──────────────────────────────────────────────────────
  {
    label: 'footer .zk-footer-brand tagline',
    re: /(<div class="zk-footer-brand">[\s\S]*?<p>)([\s\S]*?)(<\/p>)/,
    fn: (m, o, i, c) => o + IDENTITY + c
  },
  {
    // "Free online tools. Your files never leave your device." is also factually
    // wrong on this site: the AI tools post text to a model provider. The ATS
    // page says so plainly; the footer contradicted it on 36 pages.
    label: 'footer .fp-footer line',
    re: /<p>©\s*20\d\d ZapKitt[^<]*<\/p>/,
    fn: () => `<p>${COPYRIGHT}</p>`
  },
  {
    label: 'footer copyright (generic)',
    re: /©\s*20\d\d ZapKitt(?:\s*[·—-]\s*)?(?:Free (?:AI career tools|online tools)[^<.]*)?\.?(?:\s*Made in India\.?)?/g,
    fn: () => COPYRIGHT
  }
];

// ── Run ─────────────────────────────────────────────────────────────────────
const files = fs.readdirSync('.').filter(f => f.endsWith('.html') && !SKIP.has(f));
const tally = {};
let changed = 0;

for (const file of files) {
  const before = fs.readFileSync(file, 'utf8');
  let after = before;

  for (const rule of RULES) {
    const next = after.replace(rule.re, rule.fn);
    if (next !== after) { tally[rule.label] = (tally[rule.label] || 0) + 1; after = next; }
  }

  if (after !== before) {
    changed++;
    if (APPLY) fs.writeFileSync(file, after);
  }
}

console.log((APPLY ? 'Applied to ' : 'Would change ') + changed + ' of ' + files.length + ' pages\n');
for (const k of Object.keys(tally).sort()) console.log('  ' + String(tally[k]).padStart(3) + '  ' + k);
if (!APPLY) console.log('\n(--check: nothing written)');
