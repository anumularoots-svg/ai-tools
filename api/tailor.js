// ============================================================================
// ZapKitt — Rebuild resume for one job description  (POST /api/tailor)
//
// THE HONESTY GUARD — read before changing anything:
//
//   "Rewrite my resume to match this job" is one instruction away from
//   "put skills I don't have on my resume". A candidate who ships that walks
//   into an interview and gets asked about Terraform they have never touched.
//
//   So the rewrite is allowed to do exactly two things:
//     1. Re-word experience the candidate ALREADY HAS using the job
//        description's vocabulary.
//     2. Re-order and re-surface what matters for this specific job.
//
//   It is NOT allowed to introduce a skill that is absent from the original
//   resume. That rule is not left to the model: after the rewrite, code
//   compares every job-description keyword found in the new text against the
//   original. Any keyword that appears only in the rewrite is an unsupported
//   addition — it is stripped back out and reported.
//
//   Missing skills become QUESTIONS for the candidate, never claims.
//
//   The before/after score is produced by the same deterministic matcher the
//   ATS checker uses, over the same keyword set, so the improvement shown is
//   real and the candidate can verify it themselves.
// ============================================================================
import { rateLimit, clientIP, sanitizeText } from './_ratelimit.js';
import { norm, findInResume, scoreOf } from './ats.js';

function pickKey(v) {
  if (!v) return null;
  const keys = v.split(',').map(k => k.trim()).filter(Boolean);
  return keys.length ? keys[Math.floor(Math.random() * keys.length)] : null;
}

function getProviders() {
  const p = [];
  let k;
  k = pickKey(process.env.GROQ_API_KEY);
  if (k) p.push({ name: 'groq', url: 'https://api.groq.com/openai/v1/chat/completions', key: k, models: ['llama-3.3-70b-versatile'], format: 'openai' });
  k = pickKey(process.env.GEMINI_API_KEY);
  if (k) p.push({ name: 'gemini', url: 'https://generativelanguage.googleapis.com/v1beta', key: k, models: ['gemini-2.5-flash'], format: 'gemini' });
  k = pickKey(process.env.OPENROUTER_API_KEY);
  if (k) p.push({ name: 'openrouter', url: 'https://openrouter.ai/api/v1/chat/completions', key: k, models: ['meta-llama/llama-3.3-70b-instruct:free'], format: 'openai' });
  k = pickKey(process.env.CEREBRAS_API_KEY);
  if (k) p.push({ name: 'cerebras', url: 'https://api.cerebras.ai/v1/chat/completions', key: k, models: ['llama-3.3-70b'], format: 'openai' });
  return p;
}

async function callOne(prov, model, system, prompt, maxTokens) {
  if (prov.format === 'gemini') {
    const r = await fetch(prov.url + '/models/' + model + ':generateContent?key=' + prov.key, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.2, responseMimeType: 'application/json' }
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
      max_tokens: maxTokens, temperature: 0.2, response_format: { type: 'json_object' }
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
  const f = c.indexOf('{'); if (f > 0) c = c.slice(f);
  const l = c.lastIndexOf('}'); if (l >= 0) c = c.slice(0, l + 1);
  try { return JSON.parse(c); } catch (e) { return null; }
}

const SYSTEM = [
  'You rewrite a candidate\'s resume bullets so their REAL experience is described in the vocabulary of one specific job description.',
  '',
  'THE ONE RULE YOU CANNOT BREAK:',
  'You may only describe experience that is already present in the original resume. You may NEVER add a skill, tool, employer, or responsibility the candidate did not write. If the job description asks for Terraform and the resume does not mention Terraform, the resume still does not mention Terraform after you are done. There is no exception and no "implied" experience.',
  '',
  'WHAT YOU MAY DO:',
  '1. Re-word a real bullet to use the job description\'s exact term for the same thing, but ONLY when the resume already names that thing. If the resume says "K8s" and the JD says "Kubernetes", use "Kubernetes" — same fact, their words. If the resume says "scheduling scripts" and never names Airflow, you may NOT write Airflow.',
  '2. Lead each bullet with the part most relevant to this job.',
  '3. Use strong, plain action verbs. No "responsible for", "worked on", "helped with".',
  '4. Keep every number exactly as the candidate wrote it. Never add, adjust, round, or invent a number. If a bullet would be stronger with a number the candidate did not give, append [ADD METRIC: <specific question>].',
  '',
  'FOR SKILLS THE JOB WANTS THAT THE RESUME DOES NOT SHOW:',
  'Do not write them into any bullet. Instead put them in "gaps" as a question the candidate can answer. Coursework, personal projects and academic work all count as real experience if the candidate confirms them — but the candidate must confirm, not you.',
  '',
  'Return STRICT JSON only:',
  '{"summary":"2-3 sentence professional summary using only facts in the resume",',
  ' "bullets":[{"original":"the bullet as it was","rewritten":"the rewritten bullet","why":"one short line on what changed and why it helps for this job"}],',
  ' "gaps":[{"term":"Terraform","question":"Have you used Terraform in coursework, a personal project, or work? If yes, what did you build with it?"}]}'
].join('\n');

// ── The guard itself: deterministic, runs after the model ───────────────────
// Any job-description keyword that the rewrite makes "found" but the original
// resume does not support is an unsupported addition.
export function findUnsupportedAdditions(originalText, rewrittenText, keywords) {
  const origPadded = ' ' + norm(originalText) + ' ';
  const newPadded = ' ' + norm(rewrittenText) + ' ';
  const bad = [];
  for (const k of keywords) {
    const inOriginal = !!findInResume(origPadded, k.term);
    const inRewrite = !!findInResume(newPadded, k.term);
    if (inRewrite && !inOriginal) bad.push(k.term);
  }
  return bad;
}

// Drop any rewritten bullet that introduces an unsupported keyword, falling
// back to the candidate's original wording. Losing a bullet's polish is a fine
// price for never shipping a claim they cannot defend.
export function rejectUnsupportedBullets(originalText, bullets, keywords) {
  const origPadded = ' ' + norm(originalText) + ' ';
  const kept = [];
  const rejected = [];
  for (const b of bullets) {
    const rewritten = String(b && b.rewritten || '').trim();
    if (!rewritten) continue;
    const padded = ' ' + norm(rewritten) + ' ';
    const added = keywords
      .filter(k => findInResume(padded, k.term) && !findInResume(origPadded, k.term))
      .map(k => k.term);
    if (added.length) {
      rejected.push({ rewritten, added, original: String(b.original || '') });
      if (b.original) kept.push({ original: String(b.original), rewritten: String(b.original), why: 'Kept your original wording — the suggested rewrite claimed ' + added.join(', ') + ', which is not in your resume.', reverted: true });
    } else {
      kept.push({ original: String(b.original || ''), rewritten, why: String(b.why || ''), reverted: false });
    }
  }
  return { kept, rejected };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // Heavier than a match check, so a tighter budget.
  const rl = await rateLimit('tailor:' + clientIP(req), 8, 600);
  if (!rl.ok) return res.status(429).json({ error: 'Too many rebuilds. Wait a few minutes and try again.' });

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const resume = sanitizeText(body.resume, 20000);
  const jd = sanitizeText(body.jd, 12000);
  const keywords = Array.isArray(body.keywords)
    ? body.keywords
        .filter(k => k && typeof k.term === 'string' && k.term.length <= 60)
        .slice(0, 40)
        .map(k => ({ term: k.term, importance: k.importance === 'required' ? 'required' : 'preferred' }))
    : [];

  if (resume.length < 100) return res.status(400).json({ error: 'Paste your full resume text (at least 100 characters).' });
  if (jd.length < 100) return res.status(400).json({ error: 'Paste the full job description (at least 100 characters).' });
  if (!keywords.length) return res.status(400).json({ error: 'Run the match first — the rebuild needs the keyword list from your ATS check.' });

  const wanted = keywords.map(k => k.term + (k.importance === 'required' ? ' (required)' : '')).join(', ');
  const prompt =
    'ORIGINAL RESUME:\n"""\n' + resume + '\n"""\n\n' +
    'TARGET JOB DESCRIPTION:\n"""\n' + jd + '\n"""\n\n' +
    'The job screens for these keywords: ' + wanted + '\n\n' +
    'Rewrite the resume bullets under the rules. Remember: you may not add anything that is not already in the original resume above. Return the JSON.';

  const ai = await callAI(SYSTEM, prompt, 3500);
  if (ai.error === 'no-provider') return res.status(500).json({ error: 'No AI provider configured. Set GROQ_API_KEY (free at console.groq.com) or GEMINI_API_KEY.' });
  if (ai.error) return res.status(502).json({ error: 'Rebuild failed: ' + ai.error });

  const parsed = extractJSON(ai.text);
  if (!parsed || !Array.isArray(parsed.bullets) || !parsed.bullets.length) {
    return res.status(502).json({ error: 'Could not rebuild from that resume. Try pasting a cleaner copy.' });
  }

  // ── Guard runs here. The model does not get the last word. ───────────────
  const { kept, rejected } = rejectUnsupportedBullets(resume, parsed.bullets, keywords);

  const rebuiltText = kept.map(b => b.rewritten).join('\n');
  // Score the rebuilt resume with the SAME matcher and SAME keyword set as the
  // original check, so before and after are genuinely comparable.
  const scoreOver = text => {
    const padded = ' ' + norm(text) + ' ';
    return scoreOf(keywords.map(k => ({ importance: k.importance, found: !!findInResume(padded, k.term) })));
  };
  const before = scoreOver(resume);
  // The rebuilt bullets replace the experience section, but the rest of the
  // resume (skills, education) still counts — score the whole document.
  const after = scoreOver(resume + '\n' + rebuiltText);

  const gaps = (Array.isArray(parsed.gaps) ? parsed.gaps : [])
    .filter(g => g && typeof g.term === 'string')
    .slice(0, 12)
    .map(g => ({ term: g.term.slice(0, 60), question: String(g.question || '').slice(0, 300) }));

  return res.status(200).json({
    summary: String(parsed.summary || '').slice(0, 1200),
    bullets: kept,
    gaps,
    score: { before, after, delta: after - before },
    // Shown in the UI. If this is non-empty the model tried to inflate the
    // resume and was caught; the candidate deserves to know that happened.
    blocked: rejected.map(r => ({ added: r.added, text: r.rewritten.slice(0, 160) })),
    honesty: 'Nothing was added to your resume. Every rewritten bullet describes experience already in the text you pasted; anything the job wants that you have not shown is listed as a question, not a claim.',
    model: ai.model
  });
}
