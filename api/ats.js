// ============================================================================
// ZapKitt — ATS + JD Matcher  (POST /api/ats)
//
// ACCURACY CONTRACT — read this before changing anything:
//
//   The AI's ONLY job is to read the job description and list the skills it
//   asks for. It is NEVER asked "is this in the resume?" — that question is
//   answered by deterministic code below (normalise → alias → token match).
//
//   Why: an LLM asked to compare two documents will confidently claim a
//   keyword is present when it is not. That single hallucination is what makes
//   competitor scores untrustworthy. Here, every "found" is a literal substring
//   or alias hit that can be pointed at in the resume text, and the score is a
//   published formula over those hits — not a number the model invented.
//
//   Consequence: the same resume + JD always produce the same score.
// ============================================================================
import { rateLimit, clientIP, sanitizeText } from './_ratelimit.js';

// ── Provider fan-out (all free tiers, same order as the rest of the site) ────
function pickKey(v) {
  if (!v) return null;
  const keys = v.split(',').map(k => k.trim()).filter(Boolean);
  return keys.length ? keys[Math.floor(Math.random() * keys.length)] : null;
}

function getProviders() {
  const p = [];
  let k;
  k = pickKey(process.env.GROQ_API_KEY);
  if (k) p.push({ name: 'groq', url: 'https://api.groq.com/openai/v1/chat/completions', key: k, models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'], format: 'openai' });
  k = pickKey(process.env.GEMINI_API_KEY);
  if (k) p.push({ name: 'gemini', url: 'https://generativelanguage.googleapis.com/v1beta', key: k, models: ['gemini-2.5-flash', 'gemini-2.0-flash-lite'], format: 'gemini' });
  k = pickKey(process.env.OPENROUTER_API_KEY);
  if (k) p.push({ name: 'openrouter', url: 'https://openrouter.ai/api/v1/chat/completions', key: k, models: ['meta-llama/llama-3.3-70b-instruct:free'], format: 'openai' });
  k = pickKey(process.env.CEREBRAS_API_KEY);
  if (k) p.push({ name: 'cerebras', url: 'https://api.cerebras.ai/v1/chat/completions', key: k, models: ['llama-3.3-70b'], format: 'openai' });
  return p;
}

async function callOne(prov, model, system, prompt, maxTokens) {
  if (prov.format === 'gemini') {
    const r = await fetch(prov.url + '/models/' + model + ':generateContent?key=' + prov.key, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.1, responseMimeType: 'application/json' }
      })
    });
    if (!r.ok) throw new Error('gemini ' + r.status);
    const d = await r.json();
    return d.candidates && d.candidates[0] && d.candidates[0].content
      ? d.candidates[0].content.parts.map(x => x.text || '').join('') : null;
  }
  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + prov.key };
  if (prov.name === 'openrouter') { headers['HTTP-Referer'] = 'https://zapkitt.com'; headers['X-Title'] = 'ZapKitt'; }
  const r = await fetch(prov.url, {
    method: 'POST', headers,
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.1,
      response_format: { type: 'json_object' }
    })
  });
  if (!r.ok) throw new Error(prov.name + ' ' + r.status);
  const d = await r.json();
  return d.choices && d.choices[0] && d.choices[0].message ? d.choices[0].message.content : null;
}

async function callAI(system, prompt, maxTokens) {
  const providers = getProviders();
  if (!providers.length) return { error: 'no-provider' };
  let last = '';
  for (const prov of providers) {
    for (const model of prov.models) {
      try {
        const text = await callOne(prov, model, system, prompt, maxTokens);
        if (text && text.trim()) return { text, model: prov.name + '/' + model };
      } catch (e) { last = e.message; }
    }
  }
  return { error: last || 'all providers failed' };
}

function extractJSON(text) {
  let c = String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  c = c.replace(/```json/gi, '').replace(/```/g, '').trim();
  const f = c.indexOf('{');
  if (f > 0) c = c.slice(f);
  const l = c.lastIndexOf('}');
  if (l >= 0) c = c.slice(0, l + 1);
  try { return JSON.parse(c); } catch (e) { return null; }
}

// ── Normalisation ───────────────────────────────────────────────────────────
// Lowercase, strip accents, collapse punctuation that ATS parsers also ignore.
// "Node.js" / "NodeJS" / "node js" all normalise to "node js" so they match.
export function norm(s) {
  let t = String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
  // Protect symbol-bearing tech names BEFORE punctuation is stripped. Without
  // this, "C++" and "C#" both collapse to "c" and then match the bare letter C
  // anywhere in the resume — a false "found" on the most-checked skill there is.
  t = t
    .replace(/c\+\+/g, ' cplusplus ')
    .replace(/c#/g, ' csharp ')
    .replace(/f#/g, ' fsharp ')
    .replace(/\.net/g, ' dotnet ')
    .replace(/ci\s*\/\s*cd/g, ' cicd ')
    .replace(/node\.js/g, ' nodejs ')
    .replace(/next\.js/g, ' nextjs ')
    .replace(/vue\.js/g, ' vuejs ')
    .replace(/express\.js/g, ' expressjs ');
  return t
    .replace(/[._/\\+#-]/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Aliases both ways: if the JD says one and the resume says the other, that is
// a real match and pretending otherwise produces a falsely low score.
// Only genuine synonyms live here — "CI/CD" is NOT an alias of "GitHub Actions"
// (a JD asking specifically for GitHub Actions is not satisfied by Jenkins).
const ALIASES = {
  'javascript': ['js', 'ecmascript'],
  'typescript': ['ts'],
  'kubernetes': ['k8s'],
  'postgresql': ['postgres', 'psql'],
  'microsoft sql server': ['mssql', 'sql server'],
  'amazon web services': ['aws'],
  'google cloud platform': ['gcp', 'google cloud'],
  'microsoft azure': ['azure'],
  'continuous integration continuous deployment': ['ci cd', 'ci/cd', 'continuous integration', 'continuous delivery'],
  'machine learning': ['ml'],
  'artificial intelligence': ['ai'],
  'natural language processing': ['nlp'],
  'deep learning': ['dl'],
  'large language model': ['llm', 'llms'],
  'extract transform load': ['etl', 'elt'],
  'rest api': ['restful api', 'rest apis', 'restful', 'rest'],
  'object oriented programming': ['oop'],
  'test driven development': ['tdd'],
  'user interface': ['ui'],
  'user experience': ['ux'],
  'infrastructure as code': ['iac'],
  'apache spark': ['spark', 'pyspark'],
  'apache kafka': ['kafka'],
  'apache airflow': ['airflow'],
  'react': ['react js', 'reactjs'],
  'node js': ['node', 'nodejs'],
  'c sharp': ['c#', 'csharp'],
  'c plus plus': ['c++', 'cpp'],
  'golang': ['go lang'],
  'scikit learn': ['sklearn'],
  'tensorflow': ['tf'],
  'business intelligence': ['bi'],
  'power bi': ['powerbi'],
  'agile': ['scrum', 'agile scrum'],
  'version control': ['git'],
  'software development life cycle': ['sdlc'],
  'quality assurance': ['qa'],
  'single sign on': ['sso'],
  'representational state transfer': ['rest']
};

// Expand a keyword into every surface form that should count as the same skill.
export function variants(keyword) {
  const base = norm(keyword);
  const out = new Set([base]);
  if (ALIASES[base]) ALIASES[base].forEach(a => out.add(norm(a)));
  for (const canon of Object.keys(ALIASES)) {
    if (ALIASES[canon].some(a => norm(a) === base)) {
      out.add(norm(canon));
      ALIASES[canon].forEach(a => out.add(norm(a)));
    }
  }
  // Trivial plural/singular so "APIs" matches "API".
  for (const v of Array.from(out)) {
    if (v.endsWith('s') && v.length > 3) out.add(v.slice(0, -1));
    else out.add(v + 's');
  }
  return Array.from(out).filter(Boolean);
}

// Whole-token containment: "java" must not match inside "javascript".
// We search the normalised resume padded with spaces for " phrase ".
function containsPhrase(haystackPadded, phrase) {
  if (!phrase) return false;
  return haystackPadded.indexOf(' ' + phrase + ' ') !== -1;
}

export function findInResume(resumeNormPadded, keyword) {
  for (const v of variants(keyword)) {
    if (containsPhrase(resumeNormPadded, v)) return v;
  }
  return null;
}

// ── Deterministic resume-format checks (no AI involved) ─────────────────────
const QUANT = /(\d+(?:\.\d+)?\s*%|\$\s?\d|\d[\d,]{2,}|\b\d+(?:\.\d+)?\s*(?:x|k|m|bn|billion|million|thousand|hours?|days?|weeks?|months?|users?|customers?|clients?|records?|requests?|queries?|tests?|people|engineers?|members?)\b)/gi;
const SECTIONS = [
  { key: 'experience', label: 'Work experience', re: /\b(experience|employment|work history|professional background)\b/i },
  { key: 'education', label: 'Education', re: /\b(education|academic|university|bachelor|master|b\.?tech|m\.?tech|b\.?s\.?c|m\.?s\.?c)\b/i },
  { key: 'skills', label: 'Skills', re: /\b(skills|technical skills|technologies|competencies|tech stack)\b/i }
];

export function formatChecks(resume) {
  const checks = [];
  const emailOk = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(resume);
  const phoneOk = /(\+?\d[\d\s().-]{7,}\d)/.test(resume);
  const linkedinOk = /linkedin\.com\/in\//i.test(resume);

  checks.push({ id: 'email', label: 'Email address found', pass: emailOk, fix: 'Add a professional email at the top — ATS parsers reject resumes with no contact email.' });
  checks.push({ id: 'phone', label: 'Phone number found', pass: phoneOk, fix: 'Add a phone number with country code (e.g. +1 469-555-0134).' });
  checks.push({ id: 'linkedin', label: 'LinkedIn URL found', pass: linkedinOk, fix: 'Add your linkedin.com/in/… URL — recruiters check it before replying.' });

  for (const s of SECTIONS) {
    checks.push({ id: s.key, label: s.label + ' section found', pass: s.re.test(resume), fix: 'Add a clearly labelled "' + s.label + '" heading. ATS parsers assign text to fields by heading.' });
  }

  const quantHits = (resume.match(QUANT) || []).length;
  checks.push({
    id: 'quantified', label: 'Quantified achievements (' + quantHits + ' found)', pass: quantHits >= 3,
    fix: 'Add numbers to at least 3 bullets — scale, %, time saved, users served. Bullets without numbers read as job duties, not achievements.'
  });

  const words = resume.split(/\s+/).filter(Boolean).length;
  checks.push({
    id: 'length', label: 'Length ' + words + ' words', pass: words >= 250 && words <= 1000,
    fix: words < 250 ? 'Resume looks short (' + words + ' words). Aim for 400–800 — thin resumes lose to keyword-rich ones.'
                     : 'Resume is long (' + words + ' words). Trim to 1 page (fresher) or 2 pages (experienced).'
  });

  return { checks, quantHits, words };
}

// ── Scoring — published formula, no AI, no fudge factor ─────────────────────
// Required keywords carry weight 2, preferred weight 1. Score is the share of
// available weight the resume actually covers. Nothing else moves the number.
export function scoreOf(matched) {
  let got = 0, total = 0;
  for (const k of matched) {
    const w = k.importance === 'required' ? 2 : 1;
    total += w;
    if (k.found) got += w;
  }
  if (!total) return 0;
  return Math.round((got / total) * 100);
}

const SYSTEM = [
  'You are an ATS keyword extraction engine. You read ONE job description and list the concrete, screenable skills it asks for.',
  '',
  'Rules:',
  '1. Extract ONLY terms that literally appear in the job description. Never invent a skill because it is "commonly related".',
  '2. Each keyword must be a short noun phrase a recruiter would search for: "Kubernetes", "Apache Airflow", "financial modeling", "IFRS", "patient triage". 1-4 words.',
  '3. importance is "required" only if the JD puts it under requirements/must-have/qualifications, or uses words like required, must, essential. Otherwise "preferred".',
  '4. category is one of: tool, hard_skill, soft_skill, certification, domain.',
  '5. Do NOT output generic filler ("team player", "communication") unless the JD explicitly names it.',
  '6. Do NOT output company names, benefits, locations, or job titles.',
  '7. Extract 15-30 keywords. Deduplicate: never output both "AWS" and "Amazon Web Services".',
  '',
  'Return STRICT JSON only, no prose:',
  '{"role":"<job title from the JD>","seniority":"<intern|entry|mid|senior|unclear>","keywords":[{"term":"Kubernetes","importance":"required","category":"tool"}]}'
].join('\n');

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // 20 checks / 10 min per IP — generous (this is the traffic magnet) but bounded.
  const rl = await rateLimit('ats:' + clientIP(req), 20, 600);
  if (!rl.ok) return res.status(429).json({ error: 'Too many checks. Wait a few minutes and try again.' });

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const resumeRaw = sanitizeText(body.resume, 20000);
  const jdRaw = sanitizeText(body.jd, 12000);

  if (resumeRaw.length < 100) return res.status(400).json({ error: 'Paste your full resume text (at least 100 characters).' });
  if (jdRaw.length < 100) return res.status(400).json({ error: 'Paste the full job description (at least 100 characters).' });

  const ai = await callAI(SYSTEM, 'JOB DESCRIPTION:\n"""\n' + jdRaw + '\n"""\n\nExtract the keywords as JSON.', 2000);
  if (ai.error === 'no-provider') {
    return res.status(500).json({ error: 'No AI provider configured. Set GROQ_API_KEY (free at console.groq.com) or GEMINI_API_KEY.' });
  }
  if (ai.error) return res.status(502).json({ error: 'Keyword extraction failed: ' + ai.error });

  const parsed = extractJSON(ai.text);
  if (!parsed || !Array.isArray(parsed.keywords) || !parsed.keywords.length) {
    return res.status(502).json({ error: 'Could not read the job description. Try pasting a cleaner copy of the JD.' });
  }

  // Deduplicate on normalised form so "AWS" and "aws" collapse to one entry.
  const seen = new Set();
  const keywords = [];
  for (const k of parsed.keywords) {
    const term = String(k && k.term || '').trim();
    if (!term || term.length > 60) continue;
    const n = norm(term);
    if (!n || seen.has(n)) continue;
    // Collapse alias pairs: if a variant of this term is already accepted, skip.
    if (variants(term).some(v => seen.has(v))) continue;
    seen.add(n);
    keywords.push({
      term,
      importance: k.importance === 'required' ? 'required' : 'preferred',
      category: ['tool', 'hard_skill', 'soft_skill', 'certification', 'domain'].includes(k.category) ? k.category : 'hard_skill'
    });
  }
  if (!keywords.length) return res.status(502).json({ error: 'No screenable keywords found in that job description.' });

  // ── The match itself: pure code, fully reproducible ──────────────────────
  const resumePadded = ' ' + norm(resumeRaw) + ' ';
  const matched = keywords.map(k => {
    const hit = findInResume(resumePadded, k.term);
    return { ...k, found: !!hit, matchedAs: hit };
  });

  const found = matched.filter(k => k.found);
  const missing = matched.filter(k => !k.found);
  const missingRequired = missing.filter(k => k.importance === 'required');
  const score = scoreOf(matched);

  const fmt = formatChecks(resumeRaw);
  const failedChecks = fmt.checks.filter(c => !c.pass);

  // Action items, ordered by what actually moves the score. Deterministic —
  // the user can verify every line against the lists above.
  const actions = [];
  for (const k of missingRequired.slice(0, 5)) {
    actions.push({
      priority: 'high',
      text: 'Add "' + k.term + '" — the JD lists it as required. Only add it if you have real exposure (coursework and personal projects count); write it into a bullet, do not keyword-stuff a list.'
    });
  }
  for (const k of missing.filter(k => k.importance === 'preferred').slice(0, 3)) {
    actions.push({ priority: 'medium', text: 'Consider adding "' + k.term + '" — listed as preferred, and it is a cheap win if you have touched it.' });
  }
  for (const c of failedChecks.slice(0, 4)) {
    actions.push({ priority: c.id === 'quantified' ? 'high' : 'medium', text: c.fix });
  }
  if (missingRequired.length > 6) {
    actions.unshift({
      priority: 'high',
      text: missingRequired.length + ' of the required skills are missing. That is a large gap — this role may be a stretch. Applying is still fine, but prioritise roles where you clear 70%+.'
    });
  }

  let verdict;
  if (score >= 80) verdict = { label: 'Strong match', tone: 'good', line: 'Your resume clears most keyword filters for this role. Fix the format items below and apply.' };
  else if (score >= 60) verdict = { label: 'Needs work', tone: 'warn', line: 'You will pass some filters but not all. Adding the required keywords below is the highest-value edit you can make.' };
  else verdict = { label: 'Weak match', tone: 'bad', line: 'Most ATS filters would drop this resume for this JD. Either close the gaps below, or target a JD closer to your actual stack.' };

  return res.status(200).json({
    score,
    verdict,
    role: String(parsed.role || '').slice(0, 120),
    seniority: parsed.seniority || 'unclear',
    counts: {
      total: matched.length,
      found: found.length,
      missing: missing.length,
      required: matched.filter(k => k.importance === 'required').length,
      requiredMissing: missingRequired.length
    },
    found: found.map(k => ({ term: k.term, importance: k.importance, category: k.category, matchedAs: k.matchedAs })),
    missing: missing.map(k => ({ term: k.term, importance: k.importance, category: k.category })),
    formatChecks: fmt.checks,
    actions,
    // Shown in the UI so the score is auditable rather than magic.
    scoring: 'Required keywords weigh 2x, preferred 1x. Score = matched weight / total weight. Matching is literal text + known aliases — no AI guessing.',
    model: ai.model
  });
}
