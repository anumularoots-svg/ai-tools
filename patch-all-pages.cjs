#!/usr/bin/env node
/**
 * ZapKitt — Auto-patcher: updates ALL HTML pages to match the new design system.
 * Run: node patch-all-pages.js
 * 
 * What it does:
 * 1. Adds zapkitt-global.css + Fraunces/JetBrains Mono fonts to <head>
 * 2. Replaces ALL navs with the unified amber nav
 * 3. Replaces ALL footers with the unified footer
 * 4. Removes UPI modal, support banner, floating CTA, back-button trap
 * 5. Updates logo color from blue (#2563EB) to amber (#D4920B)
 * 6. Adds skip-nav link
 * 7. Removes zapkitt-back.js, zapkitt-upi.js references
 */

const fs = require('fs');
const path = require('path');

const dir = __dirname;
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html') && f !== 'index.html');

console.log(`\nZapKitt Patcher — updating ${files.length} pages...\n`);

const NEW_NAV = `<a href="#main" class="zk-skip">Skip to main content</a>
<nav class="zk-nav"><div class="zk-nav-inner">
<a href="/" class="zk-logo"><svg viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="8" fill="#D4920B"/><path d="M19 5l-7 11h6l-1 12 8-14h-6.5z" fill="#fff"/></svg><div class="zk-logo-text">Zap<span>Kitt</span></div></a>
<div class="zk-nav-links" id="zkNav"><a href="/ai-resume-builder">Resume builder</a><a href="/ai-mock-interview">Mock interview</a><a href="/all-tools">All tools</a><a href="/blog">Blog</a><a href="/ai-resume-builder" class="zk-nav-cta">Get started</a></div>
<button class="zk-ham" aria-label="Menu" onclick="document.getElementById('zkNav').classList.toggle('open')"><span></span><span></span><span></span></button>
</div></nav>`;

const NEW_FOOTER = `<footer class="zk-footer" role="contentinfo">
<div class="zk-footer-inner">
<div class="zk-footer-brand"><a href="/" class="zk-logo"><svg viewBox="0 0 32 32" fill="none" width="28" height="28"><rect width="32" height="32" rx="8" fill="#D4920B"/><path d="M19 5l-7 11h6l-1 12 8-14h-6.5z" fill="#fff"/></svg><div class="zk-logo-text">Zap<span>Kitt</span></div></a><p>AI career tools for resumes, interviews, and job preparation. Free to start.</p></div>
<div class="zk-footer-col"><h4>Product</h4><a href="/ai-resume-builder">Resume builder</a><a href="/ai-mock-interview">Mock interview</a><a href="/ai-cover-letter">Cover letter</a><a href="/all-tools">All tools</a></div>
<div class="zk-footer-col"><h4>Resources</h4><a href="/blog">Blog</a><a href="mailto:hello@zapkitt.com">Suggest a tool</a></div>
<div class="zk-footer-col"><h4>Company</h4><a href="/about">About</a><a href="/privacy">Privacy policy</a><a href="mailto:hello@zapkitt.com">Contact</a></div>
</div>
<div class="zk-footer-bottom">&copy; 2026 ZapKitt. AI-powered career tools for job seekers.</div>
</footer>`;

const FONT_LINK = `<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">`;
const GLOBAL_CSS = `<link rel="stylesheet" href="/zapkitt-global.css">`;

let updated = 0, skipped = 0;

files.forEach(file => {
  const fp = path.join(dir, file);
  let html = fs.readFileSync(fp, 'utf8');
  const original = html;

  // 1. Add global CSS + fonts to <head> (if not already present)
  if (!html.includes('zapkitt-global.css')) {
    html = html.replace('</head>', `${GLOBAL_CSS}\n${FONT_LINK}\n</head>`);
  }

  // 2. Remove UPI modal (entire div)
  html = html.replace(/<div id="upiModal"[^]*?<\/div><\/div><\/div>/g, '');
  // Alternative pattern
  html = html.replace(/<div id="upiModal"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g, '');
  
  // 3. Remove support banner (#topSupport)
  html = html.replace(/<div id="topSupport"[^]*?<\/div>/g, '');
  
  // 4. Remove floating mock interview CTA
  html = html.replace(/<a href="\/ai-mock-interview" id="mockFloat"[^]*?<\/a>/g, '');
  
  // 5. Remove zapkitt-back.js (back button trap)
  html = html.replace(/<script src="\/zapkitt-back\.js"><\/script>/g, '');
  
  // 6. Remove zapkitt-upi.js
  html = html.replace(/<script src="\/zapkitt-upi\.js"><\/script>/g, '');
  
  // 7. Update logo fill color from blue to amber
  html = html.replace(/fill="#2563EB"/g, 'fill="#D4920B"');
  html = html.replace(/fill="#7C3AED"/g, 'fill="#D4920B"');
  
  // 8. Replace old nav patterns with new unified nav
  // Pattern: <nav class="nav" ...>...</nav>  or  <nav class="fp-nav">...</nav>
  html = html.replace(/<nav class="(?:nav|fp-nav)"[^]*?<\/nav>/g, NEW_NAV);
  
  // Pattern: closing </nav> after UPI modal was nested inside nav (broken HTML)
  // Clean up any orphaned </nav> tags
  html = html.replace(/<\/nav>\s*<\/nav>/g, '</nav>');
  
  // 9. Replace old footer patterns
  html = html.replace(/<footer[^>]*class="(?:foot|fp-footer|footer)"[^]*?<\/footer>/g, NEW_FOOTER);
  
  // 10. Replace gmail with custom domain
  html = html.replace(/zapkitt\.tools@gmail\.com/g, 'hello@zapkitt.com');
  
  // 11. Update CTA gradient colors to amber
  html = html.replace(/linear-gradient\(135deg,#7c3aed,#a855f7\)/g, 'var(--zk-accent)');
  html = html.replace(/linear-gradient\(135deg,#4F46E5,#06B6D4\)/g, 'var(--zk-accent)');
  
  // 12. Update accent color references in inline styles
  html = html.replace(/color:#7c3aed/g, 'color:var(--zk-accent)');
  html = html.replace(/background:#7c3aed/g, 'background:var(--zk-accent)');
  html = html.replace(/border-color:#7c3aed/g, 'border-color:var(--zk-accent)');
  html = html.replace(/background:#f3f0ff/g, 'background:var(--zk-accent-light)');
  html = html.replace(/border:1px solid #ddd6fe/g, 'border:1px solid var(--zk-border)');
  
  if (html !== original) {
    fs.writeFileSync(fp, html);
    updated++;
    console.log(`  ✓ ${file}`);
  } else {
    skipped++;
    console.log(`  - ${file} (no changes needed)`);
  }
});

console.log(`\nDone! ${updated} files updated, ${skipped} unchanged.`);
console.log(`\nNext steps:`);
console.log(`  1. Deploy to Vercel`);
console.log(`  2. Test each tool page for consistency`);
console.log(`  3. Set up hello@zapkitt.com email`);
