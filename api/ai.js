// ZapKitt AI API v4 — Multi-Provider Auto-Failover
// Groq → Google Gemini → OpenRouter → Cerebras
// Rate limiting is Upstash-backed (shared across instances, survives cold starts).
import { rateLimit, clientIP } from './_ratelimit.js';
import { METRIC_RULE, US_CONVENTIONS, isUSTarget } from '../prompts/prompt-engine.js';
import { validateResume } from '../validator/resume-validator.js';
import { sanitizeResumeJSON, sanitizeResumeText } from '../validator/us-resume-rules.js';
function extractJSON(text) {
  let c = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  c = c.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
  const f = c.indexOf("{"); if (f > 0) c = c.substring(f);
  const l = c.lastIndexOf("}"); if (l >= 0) c = c.substring(0, l + 1);
  return c;
}

// Multi-key rotation: supports comma-separated keys per provider
// Example env: GEMINI_API_KEY=key1,key2,key3,key4,key5
// Each request picks a random key → distributes load across accounts
function pickKey(envValue) {
  if (!envValue) return null;
  const keys = envValue.split(",").map(function(k) { return k.trim(); }).filter(Boolean);
  return keys.length > 0 ? keys[Math.floor(Math.random() * keys.length)] : null;
}

function getProviders() {
  const providers = [];
  var k;
  k = pickKey(process.env.GROQ_API_KEY);
  if (k) {
    providers.push({ name: "groq", url: "https://api.groq.com/openai/v1/chat/completions", key: k, models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"], format: "openai" });
  }
  k = pickKey(process.env.GEMINI_API_KEY);
  if (k) {
    providers.push({ name: "gemini", url: "https://generativelanguage.googleapis.com/v1beta", key: k, models: ["gemini-2.5-flash", "gemini-2.0-flash-lite"], format: "gemini" });
  }
  k = pickKey(process.env.OPENROUTER_API_KEY);
  if (k) {
    providers.push({ name: "openrouter", url: "https://openrouter.ai/api/v1/chat/completions", key: k, models: ["meta-llama/llama-3.3-70b-instruct:free"], format: "openai" });
  }
  k = pickKey(process.env.CEREBRAS_API_KEY);
  if (k) {
    providers.push({ name: "cerebras", url: "https://api.cerebras.ai/v1/chat/completions", key: k, models: ["llama-3.3-70b"], format: "openai" });
  }
  return providers;
}

async function callOpenAI(provider, model, system, prompt, maxTokens, temp) {
  const headers = { "Content-Type": "application/json", "Authorization": "Bearer " + provider.key };
  if (provider.name === "openrouter") { headers["HTTP-Referer"] = "https://zapkitt.com"; headers["X-Title"] = "ZapKitt"; }
  const r = await fetch(provider.url, {
    method: "POST", headers,
    body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: prompt }], max_tokens: maxTokens, temperature: temp })
  });
  if (!r.ok) { const e = await r.text().catch(function() { return ""; }); throw new Error(r.status + " " + e.substring(0, 150)); }
  const d = await r.json();
  return d.choices && d.choices[0] && d.choices[0].message ? d.choices[0].message.content : null;
}

async function callGemini(provider, model, system, prompt, maxTokens, temp) {
  const url = provider.url + "/models/" + model + ":generateContent?key=" + provider.key;
  const r = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system_instruction: { parts: [{ text: system }] }, contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: maxTokens, temperature: temp } })
  });
  if (!r.ok) { const e = await r.text().catch(function() { return ""; }); throw new Error(r.status + " " + e.substring(0, 150)); }
  const d = await r.json();
  return d.candidates && d.candidates[0] && d.candidates[0].content ? d.candidates[0].content.parts[0].text : null;
}

// getAllKeys returns all keys for a provider (for retry on rate limit)
function getAllKeys(envName) {
  var val = process.env[envName];
  if (!val) return [];
  return val.split(",").map(function(k) { return k.trim(); }).filter(Boolean);
}

async function callAI(system, prompt, maxTokens, temp) {
  // Build provider configs with ALL available keys for retry
  var providerConfigs = [
    { name: "groq", envName: "GROQ_API_KEY", url: "https://api.groq.com/openai/v1/chat/completions", models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"], format: "openai" },
    { name: "gemini", envName: "GEMINI_API_KEY", url: "https://generativelanguage.googleapis.com/v1beta", models: ["gemini-2.5-flash", "gemini-2.0-flash-lite"], format: "gemini" },
    { name: "openrouter", envName: "OPENROUTER_API_KEY", url: "https://openrouter.ai/api/v1/chat/completions", models: ["meta-llama/llama-3.3-70b-instruct:free"], format: "openai" },
    { name: "cerebras", envName: "CEREBRAS_API_KEY", url: "https://api.cerebras.ai/v1/chat/completions", models: ["llama-3.3-70b"], format: "openai" }
  ];
  var errors = [];
  var anyKey = false;

  for (var pi = 0; pi < providerConfigs.length; pi++) {
    var cfg = providerConfigs[pi];
    var allKeys = getAllKeys(cfg.envName);
    if (allKeys.length === 0) continue;
    anyKey = true;

    // Shuffle keys so each request starts with random key
    for (var s = allKeys.length - 1; s > 0; s--) {
      var j = Math.floor(Math.random() * (s + 1));
      var tmp = allKeys[s]; allKeys[s] = allKeys[j]; allKeys[j] = tmp;
    }

    // Try each key, each model
    for (var ki = 0; ki < allKeys.length; ki++) {
      var provider = { name: cfg.name, url: cfg.url, key: allKeys[ki], format: cfg.format };
      for (var mi = 0; mi < cfg.models.length; mi++) {
        var model = cfg.models[mi];
        try {
          var text = provider.format === "gemini"
            ? await callGemini(provider, model, system, prompt, maxTokens, temp)
            : await callOpenAI(provider, model, system, prompt, maxTokens, temp);
          if (text) return { text: text, model: provider.name + "/" + model };
          errors.push(cfg.name + "/" + model + ": empty response");
        } catch (e) {
          errors.push(cfg.name + "/" + model + "[key" + (ki+1) + "]: " + e.message);
          // If rate limited (429), try next key for same provider
          if (e.message.indexOf("429") >= 0) continue;
          // Other errors (auth, server) — skip to next model/provider
          break;
        }
      }
    }
  }

  if (!anyKey) return { error: "No API keys configured. Add GROQ_API_KEY or GEMINI_API_KEY in Vercel env vars." };
  return { error: errors.join(" | ") };
}

export default async function handler(req, res) {
  const origins = ["https://zapkitt.com", "https://www.zapkitt.com"];
  const o = req.headers.origin || "";
  res.setHeader("Access-Control-Allow-Origin", origins.includes(o) ? o : origins[0]);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const ip = clientIP(req);
  const rl = await rateLimit("ai:" + ip, 20, 60);
  if (!rl.ok) return res.status(429).json({ error: "Rate limit — try again in 1 minute" });
  const { prompt, system, max_tokens, mode, userData } = req.body;
  if (mode === "json" && userData) return jsonMode(res, userData);
  return legacyMode(res, prompt, system, max_tokens);
}

async function jsonMode(res, u) {
  const yrs = parseInt(u.totalExp) || 0;
  const hasExp = u.experience && u.experience.length > 0 && u.experience[0].title;
  const hasSource = !!(u.existingResume || u.backgroundDesc);
  // RULE 1 — one page under ten years. The old threshold was two years, which
  // sent a four-year candidate to two pages; in the US that reads as padding
  // and is a screen-out, not a bonus.
  const pageTarget = yrs < 10 ? 1 : 2;

  // RULE 6 — four to five bullets on the most recent role, three to four on
  // older ones. The old ladder asked for eight to ten, which is what made the
  // resume overflow before anything had been measured.
  const bc = (u.experience || []).map(function(_, i) {
    if (i === 0) return yrs < 2 ? 4 : 5;
    return i === 1 ? 4 : 3;
  });

  var lang = ((u.language || "English") + "").trim();
  var isEn = !lang || lang.toLowerCase() === "english";
  var langInstr = isEn ? "" : "\n\n⚠️ MANDATORY OUTPUT LANGUAGE = " + lang + ". Write EVERY human-readable text value in the returned JSON — summary, headline, ALL experience bullets, achievements, skill category names, strengths, coreCompetencies, quantifiedAchievements, highlights, additionalInfo — entirely and natively in " + lang + ". Do NOT write any of this content in English. Keep ONLY proper nouns unchanged (person name, company names, technology/tool/framework names, certification names, URLs, email, phone). Keep numbers, dates and metrics as digits. This language requirement overrides any English examples shown below.";

  // ==========================================================================
  // SYSTEM PROMPT — the 12 ABSOLUTE RULES.
  //
  // Every rule here is also enforced deterministically by
  // validator/us-resume-rules.js after the model answers. The prompt gets it
  // right most of the time; the sanitiser guarantees it. Rule 2 in particular
  // reversed a previous instruction that asked the model to WRITE
  // "[ADD METRIC: ...]" wherever a number was missing -- an honest anti-
  // fabrication measure whose side effect was shipping visibly unfinished
  // resumes to recruiters.
  // ==========================================================================
  const sys =
    "You are a US career expert resume writer. You produce ATS-optimized, " +
    (pageTarget === 1 ? "single-page" : "two-page") + " resumes for candidates targeting US jobs. " +
    "Follow every rule below with zero exceptions.\n\n" +
    "Return ONLY valid JSON. No markdown, no code fences, no explanation.\n\n" +
    "ABSOLUTE RULES:\n" +
    "RULE 1 - " + (pageTarget === 1 ? "ONE PAGE ONLY" : "TWO PAGES MAXIMUM") + ". This candidate has " + (u.totalExp || "0") +
      " years of experience, so the resume MUST fit on exactly " + pageTarget + " page(s). No exceptions. " +
      "Cut content to fit. Priority order for cutting: remove Certifications, remove Project Portfolio, " +
      "shorten Professional Summary, combine similar bullets.\n" +
    "RULE 2 - NEVER output placeholder text. Never write [ADD METRIC: ...], [INSERT NUMBER], [X%], or ANY " +
      "bracketed placeholder. If you do not have a specific number, write the bullet without it. " +
      "WRONG: 'Improved test coverage by [ADD METRIC: what percentage?]'. " +
      "CORRECT: 'Improved test coverage across the full regression suite' - or omit the bullet.\n" +
    "RULE 3 - NO DUPLICATE SECTIONS. Achievements appear ONCE, either as a Key Achievements section OR " +
      "inside experience bullets. Never both. Never create separate 'Key Achievements' and " +
      "'Quantified Achievements' sections.\n" +
    "RULE 4 - PROFESSIONAL SUMMARY: maximum 3 sentences, no more. Pattern: [Title] with [X] years of " +
      "experience in [domain]. Skilled in [top 3-4 technologies]. Delivered [top 1-2 quantified results].\n" +
    "RULE 5 - EVERY BULLET starts with a strong action verb and carries a quantified result WHERE THE " +
      "CANDIDATE PROVIDED ONE. If they gave no number, do not invent one and do not insert a placeholder - " +
      "state the accomplishment without a figure.\n" +
    "RULE 6 - EXPERIENCE BULLETS: maximum 5 on the most recent role, 3-4 on older roles. Each bullet is " +
      "1-2 lines and never exceeds 2 lines. Cut the weakest bullets to stay within " + pageTarget + " page(s).\n" +
    "RULE 7 - SECTIONS, in this order only: Contact Info, Professional Summary, Technical Skills, " +
      "Professional Experience, Education. Certifications ONLY if space allows AND only industry-recognized " +
      "ones (AWS, Azure, PMP, CISSP, ISTQB). NEVER employer-internal certifications such as " +
      "'Infosys Certified ...' or 'TCS Certified ...'.\n" +
    "RULE 8 - CONTACT INFO: name, email, phone, LinkedIn only. " +
      (isUSTarget(u.targetCountry)
        ? "Target is the US: do NOT put city/country in the header unless the candidate is already in the US. "
        : "") +
      "Never include photo, date of birth, marital status, or visa status.\n" +
    "RULE 9 - SKILLS: one compact block grouped by category (Languages, Frameworks, Tools, Testing), " +
      "comma-separated, maximum 4 categories worth of content. No bullet points.\n" +
    "RULE 10 - DO NOT include: Project Portfolio tables, Additional Information sections, Core Competencies " +
      "when a Skills section exists, hobbies, references, or 'Location: City, Country' as its own section.\n" +
    "RULE 11 - ATS: standard headings only (Professional Summary, Technical Skills, Professional " +
      "Experience, Education). No creative headings, no tables, no columns, no graphics.\n" +
    "RULE 12 - If a metric appears more than once in the input (e.g. '60% faster regression'), use it ONCE, " +
      "in the single most impactful bullet. Never repeat the same figure across sections.\n\n" +
    "TRUTH: never fabricate companies, titles, dates, education, or metrics. Use ONLY the supplied data. " +
    "If an EXISTING RESUME is pasted, extract every role, education entry and skill from it.\n" +
    "NEVER use the phrases: Responsible for, Worked on, Involved in, Handled.\n" +
    "Power verbs: Architected, Spearheaded, Delivered, Reduced, Automated, Designed, Led, Implemented, " +
    "Optimized, Engineered, Accelerated, Migrated, Integrated.\n" +
    METRIC_RULE + (isUSTarget(u.targetCountry) ? "\n" + US_CONVENTIONS : "") + langInstr;

  var eduStr = "";
  if (u.degree) { eduStr = u.degree; if (u.university) eduStr += " — " + u.university; if (u.gradYear) eduStr += " (" + u.gradYear + ")"; }
  if (u.additionalEdu && u.additionalEdu.trim()) eduStr += (eduStr ? "\n" : "") + u.additionalEdu.trim();

  var p = "Generate a COMPLETE " + pageTarget + "-page resume JSON.\n\nCANDIDATE:\nName: " + (u.fullName || "[EXTRACT the candidate's full name from the SOURCE RESUME/BACKGROUND below — usually at the very top. NEVER leave blank or use 'Candidate'.]") + "\nEmail: " + (u.email||"[extract from source]") + "\nPhone: " + (u.phone||"[extract from source]") + "\nLocation: " + (u.location||"[extract from source]") + "\nLinkedIn: " + (u.linkedin||"") + "\nGitHub: " + (u.github||"") + "\nTitle: " + (u.targetTitle||"") + "\nExperience: " + (u.totalExp||"0") + " years\n";
  
  p += "\nEDUCATION: " + (eduStr || (hasSource ? "EXTRACT from pasted resume below. Find degree, university, year. NEVER return Not Applicable." : "[none]"));
  p += "\nCERTIFICATIONS: " + (u.certifications || (hasSource ? "EXTRACT from pasted resume below." : "[none]"));
  p += "\nSKILLS: " + (u.techSkills || "EXTRACT from pasted resume. Group into categories. Only include categories with actual items.");
  if (u.softSkills) p += "\nSOFT SKILLS: " + u.softSkills;
  if (u.achievements) p += "\nACHIEVEMENTS: " + u.achievements;

  if (hasExp) {
    p += "\n\nWORK EXPERIENCE:";
    u.experience.forEach(function(e, i) { p += "\n" + e.title + " at " + e.company + " (" + e.start + " — " + e.end + ")" + (e.location ? ", " + e.location : "") + ". Write " + bc[i] + " STAR bullets." + (e.details ? "\nDetails: " + e.details : ""); });
  }

  if (u.existingResume) {
    p += "\n\nSOURCE RESUME (EXTRACT EVERYTHING from this):\n\"\"\"\n" + u.existingResume.substring(0, 5000) + "\n\"\"\"";
    if (!hasExp) {
      p += "\nCRITICAL: Only Source + Target were provided (Profile/Experience/Skills steps were skipped). You MUST extract EVERYTHING from the source resume:\n- The candidate's FULL NAME, email, phone, location (top of the resume)\n- ALL roles with company, title, dates\n- ALL education with degree, university, year\n- ALL certifications\n- ALL skills grouped by category\n- For each role: " + (yrs <= 6 ? "8" : "10") + " STAR bullets with metrics\n- If source has project-wise experience (Project 1, Project 2), create SEPARATE experience entries for each project";
    }
  }
  if (u.backgroundDesc) p += "\n\nBACKGROUND:\n\"\"\"\n" + u.backgroundDesc.substring(0, 3000) + "\n\"\"\"";
  if (u.jobDescription) p += "\n\nJOB DESCRIPTION (weave keywords):\n\"\"\"\n" + u.jobDescription.substring(0, 3000) + "\n\"\"\"";

  // The requested shape no longer contains projectPortfolio, coreCompetencies,
  // additionalInfo, quantifiedAchievements or strengths. Asking for a key is
  // the surest way to be given it, and RULE 10 says none of them belong on a
  // US resume -- the previous schema demanded all five and then the layout
  // dutifully printed them.
  p += "\n\nReturn ONLY this JSON:\n{\"personal\":{\"fullName\":\"" + u.fullName + "\",\"title\":\"\",\"headline\":\"\",\"email\":\"\",\"phone\":\"\",\"location\":\"\",\"linkedin\":\"\",\"github\":\"\"}," +
    "\"summary\":\"ONE single JSON string of AT MOST 3 sentences — never split into multiple values\"," +
    "\"skills\":[{\"category\":\"\",\"items\":[]}]," +
    "\"experience\":[{\"title\":\"\",\"company\":\"\",\"location\":\"\",\"startDate\":\"Mon YYYY\",\"endDate\":\"Present\",\"client\":\"\",\"bullets\":[{\"text\":\"\"}]}]," +
    "\"achievements\":[{\"text\":\"A result the candidate actually stated. Include their own figure where they gave one. If they gave no number, state the result plainly WITHOUT any bracketed placeholder.\",\"metric\":\"only if the candidate supplied it, else empty string\"}]," +
    "\"education\":[{\"degree\":\"\",\"institution\":\"\",\"year\":\"\"}]," +
    "\"certifications\":[{\"name\":\"industry-recognized only — omit employer-internal certifications entirely\"}]}";
  p += "\n\nFINAL RULES:\n" +
    "1. headline = 'Title | Key Tech | Years'. Example: 'QA Automation Engineer | Selenium, Java, TestNG, CI/CD | 4+ Years'\n" +
    "2. summary = AT MOST 3 sentences. Not 6, not 8. Three.\n" +
    "3. achievements = at most 4 items, and ONLY results not already stated in an experience bullet. " +
       "If every result is already in the bullets, return an empty array. NEVER use a bracketed placeholder.\n" +
    "4. experience bullets = " + (bc[0] || 5) + " on the most recent role, 3-4 on each older role. " +
       "Each 1-2 lines. Start with a power verb.\n" +
    "5. education = ALL degrees with university and year. Extract from the source resume.\n" +
    "6. skills = only categories WITH items, at most 5 categories.\n" +
    "7. certifications = industry-recognized only (AWS, Azure, GCP, PMP, CISSP, ISTQB, CompTIA, Scrum). " +
       "Return an empty array rather than listing employer-internal training certificates.\n" +
    "8. " + (u.fullName ? "fullName = \"" + u.fullName + "\"" : "fullName = the REAL candidate name from the source resume (top of page); NEVER blank or generic") + "\n" +
    "9. The whole document MUST fit " + pageTarget + " page(s). If it will not, cut the weakest bullets " +
       "and drop Certifications entirely. Do NOT pad to fill space.\n" +
    "10. No bracketed placeholders anywhere in the output. Not one.\n\n" +
    "JSON VALIDITY (CRITICAL): Output EXACTLY ONE valid JSON object using ONLY the keys shown above. " +
    "EVERY value must belong to a key — never emit a loose/standalone string. 'summary' is ONE string. " +
    "No duplicate keys, no trailing commas, no text or code fences outside the JSON. " +
    "The output MUST pass JSON.parse without errors." + langInstr;

  const result = await callAI(sys, p, 8000, 0.3);
  if (result.error) return res.status(500).json({ error: "AI failed: " + result.error });
  try {
    let resume = JSON.parse(extractJSON(result.text).replace(/,\s*([}\]])/g, "$1"));
    // Post-process: clean empty data
    if (resume.skills) resume.skills = resume.skills.filter(function(s) { return s.category && s.items && s.items.length > 0; });
    if (resume.education) resume.education = resume.education.filter(function(e) { return e.degree && e.degree !== "Not Applicable" && e.degree !== "N/A" && e.degree !== "Not specified"; });
    if (resume.certifications) resume.certifications = resume.certifications.filter(function(c) { return c.name && c.name.trim() && c.name !== "None" && c.name !== "N/A"; });

    // ── Enforce the 12 rules, deterministically ─────────────────────────
    // The prompt asks; this guarantees. A model told "never emit a
    // placeholder" still does it occasionally, and one "[ADD METRIC: what
    // percentage?]" reaching a recruiter costs more than every other defect
    // on the page combined.
    var ruleReport = [];
    try {
      var cleaned = sanitizeResumeJSON(resume, {
        targetPages: pageTarget,
        maxBulletsPerRole: bc[0] || 5,
        maxSummarySentences: 3,
        dropNonUSLocation: isUSTarget(u.targetCountry)
      });
      resume = cleaned.resume;
      ruleReport = cleaned.removed;
    } catch (se) { /* sanitising must never break generation */ }
    // Check every number the model wrote against what the candidate supplied.
    // This path had no validation at all, which is how invented metrics reached
    // real resumes. Never blocks the response — the user still gets their
    // resume, with the unverifiable figures called out so they can fix them.
    var validation = null;
    try {
      var v = validateResume(resume, u);
      validation = {
        score: v.score,
        passed: v.passed,
        fabricatedMetrics: v.fabricatedMetrics,
        placeholderCount: v.placeholderCount,
        issues: v.issues.filter(function(i) { return i.severity === "critical" || i.severity === "major"; }).slice(0, 12)
      };
    } catch (ve) { /* validation must never break generation */ }

    return res.status(200).json({
      resume: resume, model: result.model, validation: validation,
      targetPages: pageTarget,
      rulesApplied: ruleReport
    });
  } catch (e) {
    // Legacy text path: the same rules still apply, just against prose.
    return res.status(200).json({
      result: sanitizeResumeText(result.text), model: result.model,
      targetPages: pageTarget, jsonError: true
    });
  }
}


const QUALITY_GUARD = [
"COMPREHENSIVE CONTENT-QUALITY & SAFETY SYSTEM — these rules have the HIGHEST priority and OVERRIDE any example, template or instruction below. Silently apply EVERY check and output only content that passes ALL of them.",
"",
"A. SAFETY & MODERATION: Block all profanity, abusive, vulgar and swear words. Reject hate speech, discrimination and harassment. Remove toxic, insulting or threatening language. Block violent, explicit, sexual or disturbing content. Never expose or invent personal data (phone numbers, emails, home addresses, IDs) — redact any that appear in the input. If the input requests or contains the above, respond cleanly and professionally without reproducing it.",
"B. LANGUAGE: Write the ENTIRE output in ONE language — exactly the language requested (or the input's language if none is specified). Never mix languages in the same piece. Finish every sentence completely; never truncate or stop mid-thought.",
"C. ORIGINALITY & NON-REPETITION: No duplicate sentences, phrases or repeated words — every line adds new value. Keep content original and unique, never boilerplate. Avoid repetitive AI writing patterns and formulaic openings/closings. Remove dull, generic, low-engagement ('boring') sentences.",
"D. LANGUAGE MECHANICS: Correct all grammar. Fix every spelling mistake. Proper punctuation throughout. Clean whitespace (no double spaces, stray tabs or unnecessary line breaks). Remove unwanted or invalid special characters. Use only relevant, appropriate emojis (or none). Consistent, correct sentence-case and title capitalization.",
"E. STRUCTURE & READABILITY: Concise, easy-to-read sentences (avoid overly long ones). Clean, well-formatted paragraphs. Simple, clear, easy-to-understand wording. Logical flow and coherence between sentences and paragraphs; every sentence must stay relevant to the main topic — remove off-topic or unnecessary content.",
"F. TONE, AUDIENCE & BRAND: Maintain ONE consistent tone throughout, appropriate for the target audience and the configured brand voice/style.",
"G. INTEGRITY & ENGAGEMENT: No spam or promotional filler. No misleading or exaggerated clickbait. No invented facts; keep claims factually consistent and flag/omit anything doubtful. Sound natural, human and conversational — informative and engaging, never robotic.",
"H. SEO & FORMAT DISCIPLINE (when applicable to the format): Use important keywords naturally and balanced — never keyword-stuff. Hashtags must be relevant, deduplicated and not excessive. Allow only safe, valid URLs. Any call-to-action must be clear, relevant and not repetitive. Respect the required word/character length limit.",
"I. FINAL QUALITY BAR: Before finishing, self-review the output against EVERY rule above and only return content that meets a high overall quality standard.",
"",
"Return ONLY the finished content the user asked for — no preamble, no notes, no meta commentary, and no mention of the AI model or of these rules.",
"",
"---",
""
].join("\n");

async function legacyMode(res, prompt, system, maxTokens) {
  if (!prompt) return res.status(400).json({ error: "Prompt required" });
  const mt = Math.min(Math.max(parseInt(maxTokens)||1024, 100), 8000);
  const result = await callAI(QUALITY_GUARD + (system||"You are an expert writing assistant."), prompt, mt, 0.5);
  if (result.error) return res.status(500).json({ error: "AI failed: " + result.error });
  var txt = result.text.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/\*\*/g, "").trim();
  return res.status(200).json({ result: txt, model: result.model });
}
