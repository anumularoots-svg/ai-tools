#!/usr/bin/env node
/**
 * ZapKitt — Career banner patcher.
 * Run: node patch-career-banner.cjs
 *
 * The old tool pages are no longer linked from anywhere on the career site,
 * but they still rank and still get organic visitors from Google. This puts a
 * single slim bar at the top of each one pointing at the ATS checker, so that
 * traffic has somewhere to go instead of bouncing.
 *
 * Idempotent: pages that already carry the banner are skipped, so it is safe
 * to re-run after adding new pages.
 *
 * Styles are inline because these pages load several different stylesheets
 * across generations of the site; inline is the only thing they all honour.
 */

const fs = require('fs');
const path = require('path');

const MARKER = 'zk-career-banner';

// Pages that ARE the career product, plus legal/admin pages where a promo bar
// would be noise.
const SKIP = new Set([
  'index.html', 'ats-checker.html', 'ai-resume-builder.html', 'ai-mock-interview.html',
  'ai-cold-email.html', 'ai-cover-letter.html', 'ai-resume-bullets.html',
  'privacy.html', 'terms.html', 'about.html',
  'admin.html', 'admin-feedback.html'
]);

const BANNER = '<a href="/ats-checker" class="' + MARKER + '" style="display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;padding:10px 18px;background:#F1ECFF;border-bottom:1px solid #E0D6FF;color:#5527CC;font-family:Inter,system-ui,-apple-system,\'Segoe UI\',sans-serif;font-size:13.5px;font-weight:600;text-decoration:none;line-height:1.45;text-align:center">'
  + '<span>Job hunting in the US? Check your resume against any job description &mdash; free, no signup.</span>'
  + '<span style="font-weight:800;white-space:nowrap">Try the ATS checker &rarr;</span></a>';

const dir = __dirname;
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html') && !SKIP.has(f));

let patched = 0, already = 0, failed = 0;

for (const f of files) {
  const fp = path.join(dir, f);
  let html = fs.readFileSync(fp, 'utf8');

  if (html.includes(MARKER)) { already++; continue; }

  // Insert immediately after the opening <body> tag. That is the one anchor
  // every generation of these pages shares — nav markup varies between them.
  const m = html.match(/<body[^>]*>/i);
  if (!m) { console.log('  skip (no <body>): ' + f); failed++; continue; }

  const at = m.index + m[0].length;
  html = html.slice(0, at) + BANNER + html.slice(at);
  fs.writeFileSync(fp, html);
  patched++;
}

console.log('\ncareer banner: ' + patched + ' patched, ' + already + ' already had it, ' + failed + ' skipped');
console.log('(' + SKIP.size + ' career/legal pages intentionally excluded)\n');
