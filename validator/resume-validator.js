// ============================================
// ResumeGPT Resume Validator v1
// Validates AI JSON output before rendering
// Returns score 0-100 and list of issues
// If score < 85, application should regenerate
// ============================================

import { POWER_VERBS, BANNED_WORDS } from "../prompts/prompt-engine.js";

// ============================================
// UNSOURCED METRIC DETECTION
//
// The validator used to penalise resumes for having too FEW metrics, which
// pushed the model to invent them. It now does the opposite: it looks for
// numbers in the output that appear nowhere in what the candidate supplied.
//
// Deliberately conservative — it only inspects numbers that read as claims
// (percentages, money, multipliers, counts of things, large magnitudes) and
// ignores years, dates and versions. A number passes if any value it can be
// read as matches a value the candidate supplied, so "2.4M" is accepted
// against a source of "2,400,000".
// ============================================

// "$1.2M", "65%", "3x", "12,000 users", "2400000"
const METRIC_PATTERNS = [
  /\$\s?\d[\d,.]*\s*(?:k|m|bn|b|billion|million|thousand)?/gi,
  /\d[\d,.]*\s*%/g,
  /\b\d[\d,.]*\s*x\b/gi,
  /\b\d[\d,.]*\s*(?:k|m|bn)\b/gi,
  /\b\d[\d,.]*\s*(?:users?|customers?|clients?|records?|requests?|queries?|transactions?|engineers?|developers?|people|members?|teams?|services?|microservices?|apps?|applications?|projects?|tables?|pipelines?|models?|tickets?|stores?|sites?|countries|hours?|days?|weeks?|months?)\b/gi,
  /\b\d{4,}\b/g
];

// Years and version numbers are not achievement claims.
const YEARLIKE = /^(19|20)\d{2}$/;

function digitsOf(s) {
  return String(s == null ? "" : s).replace(/[^0-9]/g, "");
}

// Magnitude-aware value parsing. Comparing digit strings by substring is not
// good enough: "40" is a substring of "2400000", so an invented "40%" would
// look sourced against a real "2,400,000". We compare actual numeric values.
const MAGNITUDE = { k: 1e3, thousand: 1e3, m: 1e6, mn: 1e6, million: 1e6, b: 1e9, bn: 1e9, billion: 1e9 };

// Matches "2,400,000", "2.4M", "$1.2 billion", "65", "3x" — capturing the
// numeric part and any magnitude word/suffix that follows it.
const NUMBER_TOKEN = /(\d[\d,]*(?:\.\d+)?)\s*(k|m|mn|bn|b|thousand|million|billion)?\b/gi;

function tokenValues(text) {
  const vals = new Set();
  if (!text) return vals;
  NUMBER_TOKEN.lastIndex = 0;
  let m;
  while ((m = NUMBER_TOKEN.exec(String(text))) !== null) {
    const n = parseFloat(m[1].replace(/,/g, ""));
    if (!isFinite(n)) continue;
    vals.add(n);                                    // the bare number as written
    const suffix = (m[2] || "").toLowerCase();
    if (MAGNITUDE[suffix]) vals.add(n * MAGNITUDE[suffix]); // and its expansion
  }
  return vals;
}

// Every number the candidate gave us, as numeric values.
function buildSourceValues(userData) {
  const parts = [];
  const push = v => { if (typeof v === "string" || typeof v === "number") parts.push(String(v)); };

  push(userData.summary); push(userData.achievements); push(userData.techSkills);
  push(userData.softSkills); push(userData.existingResume); push(userData.backgroundDesc);
  push(userData.certifications); push(userData.additionalEdu); push(userData.totalExp);
  push(userData.gradYear); push(userData.degree); push(userData.university);
  push(userData.jobDescription);

  if (Array.isArray(userData.experience)) {
    userData.experience.forEach(e => {
      if (!e) return;
      push(e.details); push(e.title); push(e.company); push(e.start); push(e.end); push(e.location);
    });
  }
  const all = new Set();
  parts.forEach(p => tokenValues(p).forEach(v => all.add(v)));
  return all;
}

function extractMetrics(text) {
  const out = [];
  for (const re of METRIC_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      const raw = m[0].trim();
      const d = digitsOf(raw);
      if (!d) continue;
      if (YEARLIKE.test(d)) continue;      // 2024 is a date, not a claim
      out.push({ raw, digits: d });
    }
  }
  return out;
}

// A metric is sourced when any value it can be read as matches a value the
// candidate gave us. "2.4M" yields {2.4, 2400000}; a source of "2,400,000"
// yields {2400000}; they intersect, so it passes. An invented "40%" yields
// {40}, which matches nothing, so it is flagged.
function findUnsourcedMetrics(text, sourceValues) {
  return extractMetrics(text).filter(m => {
    for (const v of tokenValues(m.raw)) {
      if (sourceValues.has(v)) return false;
    }
    return true;
  });
}

const PLACEHOLDER = /\[ADD METRIC:[^\]]*\]/gi;

// Fields that must never appear on a US resume — including them invites
// discrimination screening and gets the resume dropped.
const US_FORBIDDEN_FIELDS = [
  "dateofbirth", "dob", "birthdate", "age", "maritalstatus", "gender",
  "nationality", "religion", "photo", "photograph", "fatherfsname", "fathersname",
  "passportnumber", "currentctc", "expectedctc", "noticeperiod"
];

function validateResume(resumeJSON, userData) {
  const issues = [];
  let score = 100;

  // ---- STRUCTURE CHECKS ----
  if (!resumeJSON.personal) {
    issues.push({ severity: "critical", message: "Missing personal information" });
    score -= 20;
  }
  if (!resumeJSON.summary || resumeJSON.summary.length < 100) {
    issues.push({ severity: "critical", message: "Summary too short (min 100 chars)" });
    score -= 15;
  }
  if (!resumeJSON.skills || resumeJSON.skills.length < 3) {
    issues.push({ severity: "major", message: "Too few skill categories (min 3)" });
    score -= 10;
  }
  if (!resumeJSON.experience || resumeJSON.experience.length === 0) {
    issues.push({ severity: "critical", message: "No experience section" });
    score -= 20;
  }
  if (!resumeJSON.education || resumeJSON.education.length === 0) {
    issues.push({ severity: "critical", message: "No education section" });
    score -= 15;
  }

  // ---- FABRICATION CHECKS ----
  if (resumeJSON.personal && userData.fullName) {
    const aiName = (resumeJSON.personal.fullName || "").toUpperCase().replace(/[^A-Z ]/g, "");
    const userNameWords = userData.fullName.toUpperCase().replace(/[^A-Z ]/g, "").split(/\s+/);
    const matchCount = userNameWords.filter(w => aiName.includes(w)).length;
    if (matchCount < Math.ceil(userNameWords.length * 0.5)) {
      issues.push({ severity: "critical", message: `AI changed name: "${resumeJSON.personal.fullName}" vs "${userData.fullName}"` });
      score -= 25;
    }
  }

  // Check companies match user data
  if (resumeJSON.experience && userData.experience) {
    const userCompanies = userData.experience.map(e => (e.company || "").toLowerCase().trim());
    resumeJSON.experience.forEach(exp => {
      const aiCompany = (exp.company || "").toLowerCase().trim();
      if (aiCompany && !userCompanies.some(uc => aiCompany.includes(uc) || uc.includes(aiCompany))) {
        // AI invented a company
        if (userData.existingResume && userData.existingResume.toLowerCase().includes(aiCompany)) {
          // OK — found in pasted resume
        } else {
          issues.push({ severity: "critical", message: `AI fabricated company: "${exp.company}"` });
          score -= 20;
        }
      }
    });
  }

  // ---- BULLET QUALITY CHECKS ----
  if (resumeJSON.experience) {
    let totalBullets = 0;
    let weakBullets = 0;
    let metricsCount = 0;
    let verbsUsed = new Set();

    resumeJSON.experience.forEach((exp, idx) => {
      if (!exp.bullets || exp.bullets.length === 0) {
        issues.push({ severity: "major", message: `Role "${exp.title}" has no bullets` });
        score -= 10;
        return;
      }
      if (exp.bullets.length < 3) {
        issues.push({ severity: "major", message: `Role "${exp.title}" has only ${exp.bullets.length} bullets (min 3)` });
        score -= 5;
      }

      exp.bullets.forEach(bullet => {
        const text = typeof bullet === "string" ? bullet : bullet.text || "";
        totalBullets++;

        // Check power verb
        const firstWord = text.split(/\s+/)[0];
        if (!POWER_VERBS.some(v => firstWord.toLowerCase() === v.toLowerCase())) {
          weakBullets++;
        }
        verbsUsed.add(firstWord.toLowerCase());

        // Check for metrics
        if (/\d+%|\$[\d,]+|\d+x|\d+ (team|engineers|services|apps|customers|users|projects)/.test(text)) {
          metricsCount++;
        }

        // Check for banned words
        BANNED_WORDS.forEach(bw => {
          if (text.toLowerCase().includes(bw.toLowerCase())) {
            issues.push({ severity: "minor", message: `Banned phrase "${bw}" in bullet: "${text.substring(0, 50)}..."` });
            score -= 2;
          }
        });

        // Check bullet length
        if (text.length < 40) {
          issues.push({ severity: "minor", message: `Bullet too short: "${text.substring(0, 50)}..."` });
          score -= 1;
        }
      });
    });

    // Deliberately NO penalty for a low metric count. Penalising that is what
    // made the model invent numbers. Sourced metrics are counted for reporting
    // only; the fabrication check below is what actually moves the score.

    // Verb diversity
    if (verbsUsed.size < Math.min(totalBullets * 0.6, 8)) {
      issues.push({ severity: "minor", message: `Low verb diversity: ${verbsUsed.size} unique verbs for ${totalBullets} bullets` });
      score -= 5;
    }
  }

  // ---- SKILLS CHECKS ----
  if (resumeJSON.skills) {
    const allSkills = resumeJSON.skills.flatMap(s => s.items || []);
    const uniqueSkills = new Set(allSkills.map(s => s.toLowerCase()));
    if (uniqueSkills.size < allSkills.length * 0.9) {
      issues.push({ severity: "minor", message: "Duplicate skills detected" });
      score -= 3;
    }
    resumeJSON.skills.forEach(cat => {
      if (!cat.items || cat.items.length < 2) {
        issues.push({ severity: "minor", message: `Skill category "${cat.category}" has too few items` });
        score -= 2;
      }
    });
  }

  // ---- SUMMARY CHECKS ----
  if (resumeJSON.summary) {
    BANNED_WORDS.forEach(bw => {
      if (resumeJSON.summary.toLowerCase().includes(bw.toLowerCase())) {
        issues.push({ severity: "minor", message: `Summary contains banned phrase: "${bw}"` });
        score -= 3;
      }
    });
    // No "summary has no numbers" penalty — that rule taught the model to put
    // an invented figure in the very first line a recruiter reads.
  }

  // ---- EDUCATION FABRICATION CHECK ----
  if (resumeJSON.education && userData.degree) {
    const userDeg = userData.degree.toLowerCase();
    const hasDegMatch = resumeJSON.education.some(edu =>
      (edu.degree || "").toLowerCase().includes(userDeg.split(" ")[0]) ||
      userDeg.includes((edu.degree || "").toLowerCase().split(" ")[0])
    );
    if (!hasDegMatch) {
      issues.push({ severity: "critical", message: `AI changed education: provided "${userData.degree}", got "${resumeJSON.education[0]?.degree}"` });
      score -= 15;
    }
  }

  // ---- FABRICATED METRIC CHECK ----
  // The one that matters. Every number the model wrote is checked against what
  // the candidate actually gave us.
  const sourceValues = buildSourceValues(userData);
  const fabricated = [];
  let placeholderCount = 0;

  const scan = (text, where) => {
    if (!text || typeof text !== "string") return;
    placeholderCount += (text.match(PLACEHOLDER) || []).length;
    // Placeholders legitimately contain no numbers; strip them before scanning
    // so their wording can never be mistaken for a claim.
    const stripped = text.replace(PLACEHOLDER, " ");
    findUnsourcedMetrics(stripped, sourceValues).forEach(m => {
      fabricated.push({ value: m.raw, where, text: stripped.trim().substring(0, 90) });
    });
  };

  scan(resumeJSON.summary, "summary");
  (resumeJSON.experience || []).forEach(exp => {
    (exp.bullets || []).forEach(b => scan(typeof b === "string" ? b : b && b.text, `experience: ${exp.title || "role"}`));
  });
  (resumeJSON.achievements || []).forEach(a => {
    scan(typeof a === "string" ? a : a && a.text, "achievements");
    if (a && typeof a === "object") scan(a.metric, "achievements");
  });
  (resumeJSON.projects || []).forEach(p => {
    scan(p && p.description, `project: ${(p && p.name) || ""}`);
    ((p && p.bullets) || []).forEach(b => scan(typeof b === "string" ? b : b && b.text, `project: ${(p && p.name) || ""}`));
  });

  if (fabricated.length) {
    // Capped so one bad generation cannot produce fifty issue rows.
    fabricated.slice(0, 8).forEach(f => {
      issues.push({
        severity: "critical",
        message: `Unverifiable number "${f.value}" in ${f.where} — you never provided this figure. Replace it with your real number or delete it: "${f.text}..."`
      });
    });
    score -= Math.min(40, fabricated.length * 8);
  }

  // ---- US CONVENTION CHECK ----
  if (resumeJSON.personal && typeof resumeJSON.personal === "object") {
    const keys = Object.keys(resumeJSON.personal).map(k => k.toLowerCase().replace(/[^a-z]/g, ""));
    US_FORBIDDEN_FIELDS.forEach(f => {
      if (keys.includes(f) && resumeJSON.personal[Object.keys(resumeJSON.personal).find(k => k.toLowerCase().replace(/[^a-z]/g, "") === f)]) {
        issues.push({ severity: "major", message: `"${f}" must not appear on a US resume — US employers discard resumes carrying it.` });
        score -= 6;
      }
    });
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    passed: score >= 85,
    fabricatedMetrics: fabricated,
    placeholderCount,
    issues: issues.sort((a, b) => {
      const order = { critical: 0, major: 1, minor: 2 };
      return (order[a.severity] || 3) - (order[b.severity] || 3);
    }),
    summary: `Score: ${score}/100. ${issues.filter(i => i.severity === "critical").length} critical, ${issues.filter(i => i.severity === "major").length} major, ${issues.filter(i => i.severity === "minor").length} minor issues.`
  };
}

export { validateResume };
