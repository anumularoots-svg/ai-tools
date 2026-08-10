// ZapKitt AI API v4 — Multi-Provider Auto-Failover
// Groq → Google Gemini → OpenRouter → Cerebras
// Rate limiting is Upstash-backed (shared across instances, survives cold starts).
//
// The provider failover engine lives in _ai-core.js so other modules (jobs,
// etc.) can reuse it without duplicating the rotation/retry logic.
import { callAI, extractJSON } from './_ai-core.js';
import { rateLimit, clientIP } from './_ratelimit.js';
import { METRIC_RULE, US_CONVENTIONS, isUSTarget } from '../prompts/prompt-engine.js';
import { validateResume } from '../validator/resume-validator.js';
import { sanitizeResumeJSON, sanitizeResumeText, normalizeResumeShape, salvageResumeJSON } from '../validator/us-resume-rules.js';

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
    "\"projects\":[{\"name\":\"\",\"technologies\":[],\"bullets\":[{\"text\":\"\"}]}]," +
    "\"education\":[{\"degree\":\"\",\"institution\":\"\",\"year\":\"\"}]," +
    "\"certifications\":[{\"name\":\"\"}]}";
  p += "\n\nFINAL RULES:\n" +
    "1. headline = 'Title | Key Tech | Years'. Example: 'QA Automation Engineer | Selenium, Java, TestNG, CI/CD | 4+ Years'\n" +
    "2. summary = AT MOST 3 sentences. Not 6, not 8. Three.\n" +
    "3. achievements = at most 4 items, and ONLY results not already stated in an experience bullet. " +
       "If every result is already in the bullets, return an empty array. NEVER use a bracketed placeholder.\n" +
    "4. experience bullets = " + (bc[0] || 5) + " on the most recent role, 3-4 on each older role. " +
       "Each 1-2 lines. Start with a power verb.\n" +
    "5. education = ALL degrees with university and year. Extract from the source resume.\n" +
    "6. skills = only categories WITH items, at most 5 categories. " +
       "\"items\" MUST be a JSON ARRAY of strings, e.g. [\"Python\",\"SQL\"] — never one comma-separated string.\n" +
    "7. projects = academic, capstone and personal projects the candidate described, with 1-2 bullets each. " +
       "For a candidate with little or no paid experience this is the most important section on the page — " +
       "NEVER drop a project they told you about. Return [] only if they described none.\n" +
    "8. certifications = every real certification the candidate listed, including course and platform " +
       "credentials (HackerRank, Coursera, Udemy, NPTEL) — for an entry-level candidate these carry weight. " +
       "EXCLUDE only employer-internal training certificates such as 'Infosys Certified ...' or " +
       "'TCS Certified ...'. Do NOT return an empty array when the candidate gave you certifications.\n" +
    "9. " + (u.fullName ? "fullName = \"" + u.fullName + "\"" : "fullName = the REAL candidate name from the source resume (top of page); NEVER blank or generic") + "\n" +
    "10. The whole document MUST fit " + pageTarget + " page(s). If it will not, cut the weakest bullets " +
       "and drop Certifications entirely. Do NOT pad to fill space.\n" +
    "11. No bracketed placeholders anywhere in the output. Not one.\n\n" +
    "JSON VALIDITY (CRITICAL): Output EXACTLY ONE valid JSON object using ONLY the keys shown above.\n" +
    "- EVERY key MUST have a value. Never write \"skills\": followed by a comma or a brace with nothing " +
      "in between. If a section is empty, write an empty array: \"skills\":[]. A key with no value is the " +
      "single most common way this output is rejected.\n" +
    "- Every value must belong to a key — never emit a loose/standalone string.\n" +
    "- 'summary' is ONE string. No duplicate keys, no trailing commas, no code fences, no text outside " +
      "the JSON.\n" +
    "- Close every brace and bracket you open.\n" +
    "The output MUST pass JSON.parse without errors." + langInstr;

  // ── STEP 1: get parseable JSON out of the model, retrying once. ───────
  //
  // Observed failure, verbatim: ..."skills":,"experience":,"achievements":}
  // Every one of those keys was emitted with NO VALUE. That is unparseable,
  // and the old code responded by handing result.text to the client as resume
  // prose -- so the user got a screen of raw JSON.
  //
  // Three layers now: parse, salvage what the model DID get right, and if the
  // salvage is missing the sections that make a resume a resume, ask again
  // with a blunter instruction. One retry only; latency matters more than
  // chasing a third attempt.
  const CORE = ["experience", "skills", "education", "projects"];
  let resume = null, salvageNote = null, attempts = 0;
  let result = await callAI(sys, p, 8000, 0.3);
  if (result.error) return res.status(500).json({ error: "AI failed: " + result.error });

  for (attempts = 1; attempts <= 2; attempts++) {
    const got = salvageResumeJSON(result.text);
    const haveCore = got && CORE.some(function(k) {
      var v = got.resume[k];
      return Array.isArray(v) ? v.length > 0 : !!v;
    });

    if (got && haveCore) {
      resume = got.resume;
      if (got.salvaged) salvageNote = "recovered from malformed JSON; keys the model left empty: " +
        (got.missingKeys.join(", ") || "none");
      break;
    }

    if (attempts === 2) {
      // Second attempt also unusable. Keep whatever was salvaged rather than
      // showing the user nothing -- a resume with a name and summary beats a
      // wall of JSON, and the missing-section notice will tell them what to add.
      if (got) {
        resume = got.resume;
        salvageNote = "the model returned an incomplete resume twice; missing: " +
          (got.missingKeys.join(", ") || CORE.join(", "));
      }
      break;
    }

    const retryNote = "\n\nYOUR PREVIOUS RESPONSE WAS REJECTED: it contained keys with no value " +
      "(for example \"skills\": followed immediately by a comma). Every key must have a value. " +
      "Use [] for an empty list. Return the COMPLETE resume JSON again, valid this time.";
    result = await callAI(sys, p + retryNote, 8000, 0.2);
    if (result.error) break;
  }

  if (!resume) {
    return res.status(200).json({
      result: sanitizeResumeText(result.text || ""), model: result.model,
      targetPages: pageTarget, jsonError: true
    });
  }

  // ── STEP 2: post-process. Nothing here may cost the user their resume. ──
  // Normalising first means the filters below cannot throw on a shape the
  // model improvised: certifications as bare strings, skills as an object
  // keyed by category, a null in an array.
  var ruleReport = [];
  var postError = null;
  try {
    resume = normalizeResumeShape(resume);

    if (Array.isArray(resume.skills)) resume.skills = resume.skills.filter(function(s) { return s && s.category && s.items && s.items.length > 0; });
    if (Array.isArray(resume.education)) resume.education = resume.education.filter(function(e) { return e && e.degree && e.degree !== "Not Applicable" && e.degree !== "N/A" && e.degree !== "Not specified"; });
    if (Array.isArray(resume.certifications)) resume.certifications = resume.certifications.filter(function(c) { return c && c.name && String(c.name).trim() && c.name !== "None" && c.name !== "N/A"; });

    // Enforce the 12 rules deterministically. The prompt asks; this guarantees.
    var cleaned = sanitizeResumeJSON(resume, {
      targetPages: pageTarget,
      maxBulletsPerRole: bc[0] || 5,
      maxSummarySentences: 3,
      years: yrs,
      dropNonUSLocation: isUSTarget(u.targetCountry)
    });
    resume = cleaned.resume;
    ruleReport = cleaned.removed;
  } catch (se) {
    // Surfaced rather than swallowed: silently skipping the rules used to mean
    // a resume shipped with placeholders and duplicate sections intact, and
    // nobody knew. The user still gets their resume.
    postError = String(se && se.message || se);
    console.error("resume post-processing failed:", se);
  }

  // Check every number the model wrote against what the candidate supplied.
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
  } catch (ve) { /* validation must never block the response */ }

  return res.status(200).json({
    resume: resume, model: result.model, validation: validation,
    targetPages: pageTarget,
    rulesApplied: ruleReport,
    postError: postError,
    salvageNote: salvageNote,
    attempts: attempts
  });
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
