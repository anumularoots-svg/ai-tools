// ============================================================================
// US resume rules — the belt to the system prompt's braces.
//
// The prompt tells the model what to produce. This enforces it on the way out,
// because a model that is told "never emit a placeholder" still occasionally
// emits one, and the cost of that reaching a recruiter is the whole product's
// credibility. Everything here is deterministic and runs on every generation.
//
// Rule numbers refer to the 12 ABSOLUTE RULES in the resume system prompt.
// ============================================================================

// RULE 2 — any bracketed placeholder. [ADD METRIC: ...], [INSERT NUMBER],
// [X%], [TBD] and anything else of that shape.
//
// TWO constants on purpose. A /g/ regex carries lastIndex between calls, so
// hasPlaceholder(a) && hasPlaceholder(a) returns true then FALSE on the same
// input. Using the global one for .test() let placeholders through on every
// other field.
export const PLACEHOLDER_RE = /\[[^\]]*\]/g;
const HAS_PLACEHOLDER = /\[[^\]]*\]/;

export function hasPlaceholder(s) {
  return HAS_PLACEHOLDER.test(String(s == null ? "" : s));
}

// Words a bullet is left dangling on once the placeholder after them is cut.
// "Improved test coverage by [ADD METRIC: what %?]" must not become
// "Improved test coverage by".
const DANGLING = /[\s,;:]*\b(?:by|to|from|of|with|for|across|over|reaching|achieving|totalling|totaling|resulting in|leading to|including|up to)\s*[.,;:]*\s*$/i;

// A bullet shorter than this after cleaning is a fragment, not an achievement.
const MIN_BULLET_CHARS = 20;

// IT-services employers whose internal certifications carry no weight with a
// US recruiter (RULE 7). "Infosys Certified Automation Testing Professional"
// is training attendance, not an industry credential.
const INTERNAL_CERT_ISSUERS = /^\s*(?:infosys|tcs|tata consultancy|wipro|cognizant|accenture|capgemini|hcl|tech\s*mahindra|ltimindtree|mindtree|mphasis|birlasoft|zensar|persistent|virtusa|hexaware|syntel|igate)\b/i;

// Credentials that are always worth the line, whoever issued them.
const RECOGNISED_CERT = /\b(aws|amazon web services|azure|google cloud|gcp|pmp|pmi|prince2|cissp|cisa|cism|comptia|security\+|network\+|a\+|csm|psm|scrum master|safe|itil|oracle certified|oca|ocp|microsoft certified|az-\d|ms-\d|dp-\d|ai-\d|sc-\d|ccna|ccnp|ccie|cka|ckad|cks|kubernetes|terraform|hashicorp|istqb|salesforce|tableau|databricks|snowflake|six sigma|togaf|rhce|rhcsa|red hat|linux foundation|docker certified|cfa|cpa|frm)\b/i;

// Cleans one string: drops placeholders, repairs the wreckage they leave.
export function tidyText(s) {
  return String(s == null ? "" : s)
    .replace(PLACEHOLDER_RE, "")
    .replace(/\(\s*\)/g, "")          // empty parens left behind
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:%])/g, "$1")
    .replace(/,\s*,/g, ",")
    .replace(DANGLING, "")
    .replace(/[\s\-–—,;:]+$/, "")
    .trim();
}

// True when a cleaned bullet still says something.
export function isUsableBullet(s) {
  const t = tidyText(s);
  return t.length >= MIN_BULLET_CHARS && /[a-z]/i.test(t);
}

// RULE 7 — keep industry credentials, drop employer-internal ones.
export function isWorthKeepingCert(name) {
  const n = String(name || "").trim();
  if (!n) return false;
  if (RECOGNISED_CERT.test(n)) return true;
  if (INTERNAL_CERT_ISSUERS.test(n)) return false;
  return true;   // unknown issuer: assume it is real rather than silently cutting it
}

// RULE 4 — summary is three sentences, hard stop.
//
// Naive splitting on "." mangles a resume, because resumes are full of periods
// that do not end a sentence: "1.5 years", "99.9% uptime", "B.S.", "U.S.".
// Splitting "Software Developer with 1.5 years of experience." at the decimal
// point threw away the first half of the summary. Those periods are masked
// before the split and restored afterwards.
const SENTENCE_GUARD = String.fromCharCode(1);   // non-printing sentinel, kept out of the file as a literal
const ABBREVIATIONS = /\b(Inc|Ltd|Co|Corp|Sr|Jr|Dr|Mr|Ms|Mrs|St|vs|etc|approx|Ph|D|No)\./gi;

export function trimSummary(summary, maxSentences = 3) {
  const t = tidyText(summary);
  if (!t) return "";

  const guarded = t
    .replace(/(\d)\.(\d)/g, "$1" + SENTENCE_GUARD + "$2")   // 1.5, 99.9
    .replace(/\b([A-Z])\./g, "$1" + SENTENCE_GUARD)          // B.S., U.S., M.Sc
    .replace(ABBREVIATIONS, (m) => m.slice(0, -1) + SENTENCE_GUARD);

  const parts = guarded.match(/[^.!?]+[.!?]+|\S[^.!?]*$/g) || [guarded];
  return parts.slice(0, maxSentences)
    .join(" ")
    .split(SENTENCE_GUARD).join(".")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Loose comparison so "Reduced regression time by 60%" and "reduced regression
// time by 60 %" count as the same claim.
function normaliseClaim(s) {
  return tidyText(s).toLowerCase().replace(/[^a-z0-9%]/g, "");
}

function textOf(item) {
  if (typeof item === "string") return item;
  if (item && typeof item === "object") return item.text || item.metric || "";
  return "";
}

// An entry that is education wearing a job's clothes. "Student at NRI
// Institute of Technology" was reaching the page under PROFESSIONAL
// EXPERIENCE, which tells a recruiter the candidate counts college as a job.
const NOT_A_JOB_TITLE = /^\s*(student|undergraduate|graduate|scholar|fresher|pursuing|b\.?tech|b\.?e\.?|m\.?tech|mba|bachelor|master)\b/i;
const SCHOOL_EMPLOYER = /\b(university|college|institute of technology|polytechnic|school|vidyalaya|junior college)\b/i;

export function looksLikeSchoolEntry(exp) {
  if (!exp) return false;
  const title = String(exp.title || "");
  const company = String(exp.company || "");
  if (NOT_A_JOB_TITLE.test(title)) return true;
  // A college as the employer is only a job if the title says so (Lab Assistant,
  // Teaching Assistant, Research Assistant are real roles).
  if (SCHOOL_EMPLOYER.test(company) && !/\b(assistant|associate|engineer|developer|analyst|intern|researcher|fellow|tutor)\b/i.test(title)) {
    return true;
  }
  return false;
}

// Internships, virtual experience programmes and academic work are not
// "Professional Experience" and should not be labelled as such -- but they are
// the whole substance of a fresher's resume, so they get a heading of their own.
const INTERNSHIP_TITLE = /\b(intern|internship|trainee|virtual experience|apprentice|co-?op|academic project|capstone)\b/i;

export function isEntryLevelResume(rj, years) {
  const y = Number(years);
  const roles = (rj && rj.experience || []).filter(function (e) { return e && (e.title || e.company); });
  if (!roles.length) return true;
  const allInternships = roles.every(function (e) {
    return INTERNSHIP_TITLE.test(String(e.title || "") + " " + String(e.company || ""));
  });
  if (allInternships) return true;
  return isFinite(y) && y > 0 ? y < 1 : false;
}

// Phone numbers that are not US/Canada. RULE 8: a +91 number in the header of a
// resume submitted to a US employer is a screen-out before anyone reads a word.
export function isNonUSPhone(phone) {
  const p = String(phone || "").trim();
  if (!p) return false;
  if (/^\+?1[\s\-.(]/.test(p) || /^\(\d{3}\)/.test(p)) return false;   // +1 …, (512) …
  if (/^\+/.test(p)) return true;                                       // any other country code
  const digits = p.replace(/\D/g, "");
  return digits.length !== 10;   // a bare 10-digit number is assumed domestic
}

// ============================================================================
// SALVAGE — read a resume out of JSON the model got wrong.
//
// Observed in production, verbatim:
//
//   ..."summary":"Enthusiastic and detail-oriented...","skills":,
//      "experience":,"achievements":},"education":,"certifications":}
//
// Every one of those keys was emitted with NO VALUE. JSON.parse cannot read
// that, and neither can a trailing-comma repair, so the endpoint fell back to
// text mode and the raw JSON was printed at the user. But the personal block
// and the summary in that same response were perfectly good — throwing the
// whole thing away was the wrong response to a partial failure.
//
// This walks the top level, reads each key's value with a balanced scan, and
// keeps whatever parses. Malformed keys are skipped rather than fatal.
// ============================================================================

// Read one JSON value starting at i. Returns {value,end} or null when the
// value is absent or unreadable.
function readJSONValue(s, i) {
  while (i < s.length && /\s/.test(s[i])) i++;
  const c = s[i];
  if (c === undefined || c === "," || c === "}" || c === "]") return null;  // key with no value

  if (c === '"') {
    let j = i + 1;
    while (j < s.length) {
      if (s[j] === "\\") { j += 2; continue; }
      if (s[j] === '"') break;
      j++;
    }
    if (j >= s.length) return null;
    try { return { value: JSON.parse(s.slice(i, j + 1)), end: j + 1 }; } catch (e) { return null; }
  }

  if (c === "{" || c === "[") {
    const close = c === "{" ? "}" : "]";
    let depth = 0, j = i, inStr = false;
    for (; j < s.length; j++) {
      const ch = s[j];
      if (inStr) {
        if (ch === "\\") { j++; continue; }
        if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') { inStr = true; continue; }
      if (ch === c) depth++;
      else if (ch === close) { depth--; if (depth === 0) { j++; break; } }
    }
    if (depth !== 0) return null;                    // never closed
    const raw = s.slice(i, j);
    try { return { value: JSON.parse(raw), end: j }; } catch (e) {
      try { return { value: JSON.parse(raw.replace(/,\s*([}\]])/g, "$1")), end: j }; } catch (e2) { return null; }
    }
  }

  const m = /^(true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(s.slice(i));
  if (m) { try { return { value: JSON.parse(m[1]), end: i + m[1].length }; } catch (e) { return null; } }
  return null;
}

// Returns { resume, salvaged, missingKeys } — or null if nothing usable.
export function salvageResumeJSON(text) {
  let s = String(text == null ? "" : text);
  s = s.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
  const start = s.indexOf("{");
  if (start < 0) return null;
  s = s.slice(start);

  // The happy path first: if it parses, it was never broken.
  try {
    const clean = JSON.parse(s.replace(/,\s*([}\]])/g, "$1"));
    if (clean && typeof clean === "object") return { resume: clean, salvaged: false, missingKeys: [] };
  } catch (e) { /* fall through to the salvage walk */ }

  const out = {};
  const missingKeys = [];
  let depth = 0, inStr = false, i = 0;

  while (i < s.length) {
    const ch = s[i];
    if (inStr) {
      if (ch === "\\") { i += 2; continue; }
      if (ch === '"') inStr = false;
      i++; continue;
    }
    if (ch === '"') {
      // A string at depth 1 followed by ':' is a top-level key.
      if (depth === 1) {
        let j = i + 1;
        while (j < s.length) {
          if (s[j] === "\\") { j += 2; continue; }
          if (s[j] === '"') break;
          j++;
        }
        let k = j + 1;
        while (k < s.length && /\s/.test(s[k])) k++;
        if (s[k] === ":") {
          let key = null;
          try { key = JSON.parse(s.slice(i, j + 1)); } catch (e) { key = null; }
          const got = key != null ? readJSONValue(s, k + 1) : null;
          if (key != null) {
            if (got) { out[key] = got.value; i = got.end; continue; }
            missingKeys.push(key);            // "skills":,  -> recorded, skipped
            i = k + 1; continue;
          }
        }
        i = j + 1; continue;
      }
      inStr = true; i++; continue;
    }
    if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") depth--;
    i++;
  }

  if (!Object.keys(out).length) return null;
  return { resume: out, salvaged: true, missingKeys: missingKeys };
}

// ============================================================================
// SHAPE NORMALISATION — run this before anything else touches the object.
//
// A language model returns the shape it feels like returning. Ask for
// "certifications":[{"name":""}] and you will sometimes get ["AWS","PMP"];
// ask for a skills array and you will sometimes get an object keyed by
// category. Every downstream `.filter()` then throws, and because the caller
// wrapped the whole post-processing block in one try/catch, the failure was
// indistinguishable from "the model did not return JSON" — so the raw JSON
// was rendered to the user as if it were resume text.
//
// Coercing here means the rules always run and the user always gets a resume.
// ============================================================================
const ARRAY_FIELDS = ["skills", "experience", "education", "certifications",
                      "achievements", "quantifiedAchievements", "projects",
                      "highlights", "coreCompetencies", "strengths", "projectPortfolio"];

export function normalizeResumeShape(input) {
  const rj = (input && typeof input === "object") ? input : {};

  if (!rj.personal || typeof rj.personal !== "object") rj.personal = {};

  // A summary returned as an array of lines is still a summary.
  if (Array.isArray(rj.summary)) rj.summary = rj.summary.filter(Boolean).join(" ");
  if (rj.summary != null && typeof rj.summary !== "string") rj.summary = String(rj.summary);

  ARRAY_FIELDS.forEach(function (f) {
    const v = rj[f];
    if (v == null) return;
    if (Array.isArray(v)) { rj[f] = v.filter(function (x) { return x != null && x !== ""; }); return; }
    if (typeof v === "object") {
      // {Languages:["Python"], Tools:["Git"]} -> [{category,items}]
      rj[f] = Object.keys(v).map(function (k) {
        const val = v[k];
        return (f === "skills")
          ? { category: k, items: Array.isArray(val) ? val : String(val).split(/\s*,\s*/) }
          : (val && typeof val === "object" ? val : { name: String(val) });
      });
      return;
    }
    rj[f] = [v];   // a bare string where a list was expected
  });

  // Skill items as a comma string -> a list.
  //
  // The model returns {"category":"Programming","items":"Python, SQL"} roughly
  // as often as it returns a real array. renderJSONResume() then called
  // .join() on a string, threw, and aborted the ENTIRE render — leaving the
  // resume box empty with only an alert to show for it. The PDF path survived
  // because it happened to test Array.isArray first, which is exactly why the
  // download worked while the screen did not.
  if (Array.isArray(rj.skills)) {
    rj.skills.forEach(function (s) {
      if (!s || typeof s !== "object") return;
      if (s.items == null && s.skills != null) s.items = s.skills;
      if (typeof s.items === "string") s.items = s.items.split(/\s*[,;|]\s*/).filter(Boolean);
      else if (!Array.isArray(s.items)) s.items = s.items == null ? [] : [String(s.items)];
      s.items = s.items.map(function (x) { return String(x).trim(); }).filter(Boolean);
    });
  }

  // Same coercion for every other list-of-strings the renderers .join().
  ["coreCompetencies", "strengths", "highlights"].forEach(function (f) {
    if (typeof rj[f] === "string") rj[f] = rj[f].split(/\s*[,;|]\s*/).filter(Boolean);
  });
  if (Array.isArray(rj.projects)) {
    rj.projects.forEach(function (p) {
      if (p && typeof p.technologies === "string") {
        p.technologies = p.technologies.split(/\s*[,;|]\s*/).filter(Boolean);
      }
    });
  }

  // Certifications as bare strings -> {name}. Without this they survived the
  // crash check but were silently deleted by the `c.name && ...` filter.
  if (Array.isArray(rj.certifications)) {
    rj.certifications = rj.certifications.map(function (c) {
      return typeof c === "string" ? { name: c } : c;
    }).filter(function (c) { return c && typeof c === "object"; });
  }

  // Bullets, on both experience and projects.
  ["experience", "projects"].forEach(function (f) {
    if (!Array.isArray(rj[f])) return;
    rj[f] = rj[f].filter(function (e) { return e && typeof e === "object"; });
    rj[f].forEach(function (e) {
      if (e.bullets == null) { e.bullets = []; return; }
      if (!Array.isArray(e.bullets)) e.bullets = [e.bullets];
      e.bullets = e.bullets
        .filter(function (b) { return b != null && b !== ""; })
        .map(function (b) { return typeof b === "string" ? { text: b } : b; })
        .filter(function (b) { return b && typeof b === "object"; });
    });
  });

  // Achievements as bare strings -> {text}.
  ["achievements", "quantifiedAchievements"].forEach(function (f) {
    if (!Array.isArray(rj[f])) return;
    rj[f] = rj[f]
      .map(function (a) { return typeof a === "string" ? { text: a } : a; })
      .filter(function (a) { return a && typeof a === "object"; });
  });

  return rj;
}

// ============================================================================
// The whole pass. Returns { resume, removed } — `removed` is a plain list of
// what was taken out and why, so the change is auditable rather than magic.
// ============================================================================
export function sanitizeResumeJSON(input, opts = {}) {
  // Normalise FIRST, and on a copy, so a malformed shape can never throw its
  // way out of here and be mistaken for "the model did not return JSON".
  const rj = normalizeResumeShape(JSON.parse(JSON.stringify(input || {})));
  const removed = [];
  const maxBullets = opts.maxBulletsPerRole || 5;

  // ── RULE 2: placeholders, everywhere ──────────────────────────────────
  if (rj.summary) rj.summary = tidyText(rj.summary);
  if (rj.headline) rj.headline = tidyText(rj.headline);

  // ── RULE 4: three-sentence summary ────────────────────────────────────
  if (rj.summary) {
    const before = rj.summary;
    rj.summary = trimSummary(rj.summary, opts.maxSummarySentences || 3);
    if (rj.summary !== before) removed.push("summary trimmed to 3 sentences");
  }

  // ── College is not a job ──────────────────────────────────────────────
  // "STUDENT — NRI Institute of Technology" under PROFESSIONAL EXPERIENCE
  // tells a recruiter the candidate counts being enrolled as employment.
  if (Array.isArray(rj.experience)) {
    const beforeSchool = rj.experience.length;
    rj.experience = rj.experience.filter(function (e) { return !looksLikeSchoolEntry(e); });
    const cutSchool = beforeSchool - rj.experience.length;
    if (cutSchool) removed.push(cutSchool + " education entr(y/ies) listed as employment");
  }

  // ── RULE 5/6: bullets — clean, drop fragments, de-duplicate, cap ──────
  // The cap TAPERS. Five on the most recent role, four on the one before it,
  // three on everything older. A flat cap gave a three-company candidate
  // 5+5+5, which reads as three current jobs and is what pushes an eight-year
  // resume onto a second page.
  //
  // Dedupe is GLOBAL, across every role and project. The model reuses a strong
  // sentence under each client, so the same bullet appeared four times on one
  // resume -- unmistakably machine-written to anyone reading it.
  const bulletSeen = Object.create(null);
  const capBullets = function (list, idx, label) {
    if (!Array.isArray(list)) return list;
    const capForRole = idx === 0 ? maxBullets : (idx === 1 ? 4 : 3);
    const kept = [];
    let dropped = 0, dupes = 0;
    list.forEach(function (b) {
      const raw = textOf(b);
      if (!isUsableBullet(raw)) { if (raw.trim()) dropped++; return; }
      const clean = tidyText(raw);
      const key = normaliseClaim(clean);
      if (bulletSeen[key]) { dupes++; return; }
      bulletSeen[key] = true;
      kept.push(typeof b === "string" ? clean : Object.assign({}, b, { text: clean }));
    });
    if (dropped) removed.push(dropped + " placeholder-only bullet(s) in " + label);
    if (dupes) removed.push(dupes + " repeated bullet(s) in " + label);
    if (kept.length > capForRole) {
      removed.push((kept.length - capForRole) + " surplus bullet(s) in " + label);
      kept.length = capForRole;
    }
    return kept;
  };

  if (Array.isArray(rj.experience)) {
    rj.experience.forEach(function (exp, idx) {
      if (!exp) return;
      exp.bullets = capBullets(exp.bullets, idx, exp.title || "a role");
    });
  }
  if (Array.isArray(rj.projects)) {
    rj.projects.forEach(function (pr, idx) {
      if (!pr) return;
      pr.bullets = capBullets(pr.bullets, idx + 1, pr.name || "a project");
    });
  }

  // ── RULE 7: what the experience section is CALLED ─────────────────────
  // A fresher has internships, virtual programmes and coursework. Filing them
  // under "Professional Experience" overstates them; giving them their own
  // heading presents them accurately and is what a US reviewer expects.
  rj.experienceHeading = isEntryLevelResume(rj, opts.years) && (rj.projects || []).length +
    (rj.experience || []).length > 0
    ? "Projects & Internships"
    : "Professional Experience";

  // ── RULE 3: achievements appear ONCE ──────────────────────────────────
  // Both arrays are drawn from the same pool of facts, so the model reliably
  // produced two sections saying the same thing. Merge, de-duplicate, and
  // never emit the second heading.
  const seen = Object.create(null);
  const mergedAchievements = [];
  const pushClaim = function (item) {
    const raw = textOf(item);
    if (!isUsableBullet(raw)) return;
    const clean = tidyText(raw);
    const key = normaliseClaim(clean);
    if (!key || seen[key]) return;
    seen[key] = true;
    mergedAchievements.push(typeof item === "string" ? clean : Object.assign({}, item, { text: clean }));
  };
  (rj.achievements || []).forEach(pushClaim);
  const qaBefore = (rj.quantifiedAchievements || []).length;
  (rj.quantifiedAchievements || []).forEach(pushClaim);
  if (qaBefore) removed.push("Quantified Achievements merged into Key Achievements (" + qaBefore + " item(s))");
  rj.achievements = mergedAchievements;
  delete rj.quantifiedAchievements;

  // An achievement that repeats an experience bullet verbatim is also a
  // duplicate — the recruiter reads the same sentence twice.
  const bulletKeys = Object.create(null);
  (rj.experience || []).forEach(function (exp) {
    (exp && exp.bullets || []).forEach(function (b) { bulletKeys[normaliseClaim(textOf(b))] = true; });
  });
  const beforeDedupe = rj.achievements.length;
  rj.achievements = rj.achievements.filter(function (a) { return !bulletKeys[normaliseClaim(textOf(a))]; });
  if (rj.achievements.length !== beforeDedupe) {
    removed.push((beforeDedupe - rj.achievements.length) + " achievement(s) already stated in experience bullets");
  }

  // ── RULE 7/10: sections that do not belong on a US resume ─────────────
  if (rj.projectPortfolio && rj.projectPortfolio.length) {
    removed.push("Project Portfolio table (not a US convention, and breaks ATS parsing)");
  }
  delete rj.projectPortfolio;

  if (rj.additionalInfo) {
    removed.push("Additional Information (location already appears in the header)");
  }
  delete rj.additionalInfo;

  // Core Competencies only duplicates Skills when Skills exists.
  if (rj.coreCompetencies && rj.coreCompetencies.length && rj.skills && rj.skills.length) {
    removed.push("Core Competencies (already covered by Technical Skills)");
    delete rj.coreCompetencies;
  }
  if (rj.strengths && rj.strengths.length && rj.skills && rj.skills.length) {
    delete rj.strengths;
  }

  if (Array.isArray(rj.certifications)) {
    const before = rj.certifications.length;
    rj.certifications = rj.certifications.filter(function (c) {
      return isWorthKeepingCert(typeof c === "string" ? c : (c && c.name));
    });
    const cut = before - rj.certifications.length;
    if (cut > 0) removed.push(cut + " employer-internal certification(s)");
  }

  // Highlights are a ZapKitt flourish, not a US resume section. They survive
  // only on templates that show them, and never on a one-page target.
  if (opts.targetPages === 1 && rj.highlights) {
    delete rj.highlights;
  }

  // ── RULE 8: header carries name, email and LinkedIn — nothing that says
  // "this applicant is overseas". A non-US address or a +91 number at the top
  // is a documented screen-out before a word of the resume is read.
  if (opts.dropNonUSLocation && rj.personal) {
    if (rj.personal.location &&
        !/\b(usa|u\.s\.a|united states|us|remote)\b/i.test(rj.personal.location) &&
        !/,\s*[A-Z]{2}$/.test(String(rj.personal.location).trim())) {
      removed.push("non-US location from the header (RULE 8)");
      rj.personal.location = "";
    }
    if (isNonUSPhone(rj.personal.phone)) {
      removed.push("non-US phone number from the header (RULE 8)");
      rj.personal.phone = "";
    }
  }

  // Final sweep: no bracketed text survives anywhere in the document.
  scrubStrings(rj);

  return { resume: rj, removed: removed };
}

// Depth-first placeholder scrub, so a stray [ADD METRIC] in a field nobody
// anticipated still never reaches the page.
function scrubStrings(node) {
  if (Array.isArray(node)) { node.forEach(scrubStrings); return; }
  if (!node || typeof node !== "object") return;
  Object.keys(node).forEach(function (k) {
    const v = node[k];
    if (typeof v === "string") {
      if (hasPlaceholder(v)) node[k] = tidyText(v);
    } else scrubStrings(v);
  });
}

// Text-mode equivalent, for the legacy path where the model returns PROSE
// rather than JSON.
//
// It must never be handed JSON. The placeholder regex is /\[[^\]]*\]/g, which
// happily eats a JSON array: "skills":[] becomes "skills": and
// "achievements":[]} becomes "achievements":}. That is exactly the corruption
// that reached a user's screen —
//
//   model sent : "skills":[],"experience":[],"achievements":[]}
//   user saw   : "skills":,"experience":,"achievements":}
//
// — so the model's JSON was valid and this function destroyed it. The guard
// below returns JSON untouched; salvageResumeJSON() is what handles that case.
export function sanitizeResumeText(text) {
  let t = String(text == null ? "" : text);

  const probe = t.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
  if (probe.charAt(0) === "{" || probe.charAt(0) === "[") return t;   // JSON: hands off

  t = t.replace(PLACEHOLDER_RE, "");
  // Repair bullets left dangling, then drop any that are now empty.
  t = t.split("\n").map(function (line) {
    if (!/^\s*[-•*]/.test(line)) return line;
    const body = line.replace(/^\s*[-•*]\s*/, "");
    const clean = tidyText(body);
    return clean.length >= MIN_BULLET_CHARS ? line.replace(/^(\s*[-•*]\s*).*$/, "$1" + clean) : "";
  }).filter(function (l) { return l !== ""; }).join("\n");

  // RULE 3 — one achievements heading, never two.
  const dupHeading = /\n\s*QUANTIFIED ACHIEVEMENTS\s*\n/i;
  if (/KEY ACHIEVEMENTS/i.test(t) && dupHeading.test(t)) {
    const idx = t.search(dupHeading);
    const rest = t.slice(idx + 1);
    const nextHeading = rest.search(/\n[A-Z][A-Z &/]{4,}\s*\n/);
    t = nextHeading > -1 ? t.slice(0, idx) + rest.slice(nextHeading) : t.slice(0, idx);
  }
  return t.replace(/\n{3,}/g, "\n\n").trim();
}
