// ============================================
// ResumeGPT Prompt Engine v1
// Builds the perfect prompt based on experience level
// AI returns JSON only — app handles all rendering
// ============================================

const RESUME_SCHEMA_INSTRUCTION = `
You MUST respond with ONLY a valid JSON object. No markdown, no code fences, no explanation.
The JSON must follow this exact structure:
{
  "personal": { "fullName": "", "title": "", "email": "", "phone": "", "location": "", "linkedin": "", "github": "" },
  "summary": "4-7 sentence professional summary",
  "skills": [ { "category": "Category Name", "items": ["skill1", "skill2"] } ],
  "achievements": [ { "text": "Achievement bullet", "metric": "60%" } ],
  "experience": [ { "title": "", "company": "", "location": "", "startDate": "", "endDate": "", "bullets": [ { "text": "STAR bullet", "technologies": ["tech1"] } ] } ],
  "education": [ { "degree": "", "institution": "", "year": "" } ],
  "certifications": [ { "name": "", "status": "completed" } ],
  "strengths": ["strength1", "strength2"],
  "projects": [ { "name": "", "description": "", "technologies": [], "bullets": [] } ]
}`;

// ============================================
// THE METRIC RULE — the single most important rule in this file.
//
// An earlier version of this prompt told the model to "estimate realistic
// metrics if none provided". That is instruction-to-fabricate: the candidate
// then walks into an interview defending a 40% improvement they never made.
// Numbers must come from the candidate, or be marked as missing.
// ============================================
const METRIC_RULE = `
METRICS — ABSOLUTE RULE, NO EXCEPTIONS:
- Every number in the resume (%, $, counts, team sizes, time saved, scale, users)
  MUST come from what the candidate actually told you. Copy it, do not adjust it.
- NEVER estimate, infer, approximate, or invent a number. Not even a "realistic"
  or "conservative" one. A plausible invented number is still a lie the candidate
  has to defend in an interview.
- Where a number would strengthen a bullet but the candidate did not give one,
  write the bullet WITHOUT a number and append this exact placeholder:
    [ADD METRIC: <specific question>]
  Examples:
    "Automated the nightly reconciliation job [ADD METRIC: how many hours per week did this save?]"
    "Migrated the reporting stack to Snowflake [ADD METRIC: how many tables or how much data?]"
- Placeholders are the correct, expected output. A resume with six honest
  placeholders is a better result than a resume with six invented numbers.
- Do NOT put a placeholder in every bullet. Only where a number genuinely belongs.`;

// ============================================
// US RESUME CONVENTIONS — what US recruiters and ATS expect, and what will
// get a resume discarded or expose the employer to discrimination claims.
// ============================================
const US_CONVENTIONS = `
US RESUME CONVENTIONS (the candidate is applying in the United States):
- NO photo, NO date of birth, NO age, NO gender, NO marital status, NO nationality,
  NO religion. US employers must discard resumes containing these — including them
  actively hurts the candidate.
- Location: city and state only ("Dallas, TX"). Never a full street address.
- No "References available upon request" — it wastes a line everyone ignores.
- Dates as "Mon YYYY" ("Mar 2024 – Present"). Never DD/MM/YYYY.
- Use US spelling (optimize, analyze, organization, program).
- Do not mention expected salary, current CTC, or notice period. Those are Indian
  and Gulf conventions; on a US resume they read as a category error.
- Reverse-chronological order, most recent role first.
- Freshers and candidates with under ~10 years: one page. Beyond that: two pages.
- Never claim or imply work authorization the candidate did not state. If the
  candidate provided a work-authorization status (F-1 OPT, STEM OPT, CPT, H-1B,
  GC, citizen), place it as a single short line under the contact details.
  If they did not provide one, omit the topic entirely — do not guess.`;

// ============================================
// BANNED WORDS — never appear in any resume
// ============================================
const BANNED_WORDS = [
  "hardworking", "passionate", "seeking opportunity", "self-motivated",
  "dedicated", "result-oriented", "go-getter", "team player",
  "detail-oriented", "fast learner", "think outside the box",
  "synergy", "leverage", "utilize", "responsible for",
  "duties included", "helped with", "assisted in",
  "participated in", "was involved in"
];

// ============================================
// POWER VERBS — every bullet MUST start with one
// ============================================
const POWER_VERBS = [
  "Architected", "Spearheaded", "Delivered", "Reduced", "Automated",
  "Designed", "Led", "Implemented", "Optimized", "Orchestrated",
  "Streamlined", "Championed", "Engineered", "Accelerated", "Pioneered",
  "Built", "Developed", "Deployed", "Established", "Migrated",
  "Integrated", "Enhanced", "Directed", "Transformed", "Scaled",
  "Launched", "Consolidated", "Revamped", "Modernized", "Configured"
];

// ============================================
// BULLET COUNT RULES — app decides, not AI
// ============================================
function getBulletCounts(totalYears, roles) {
  if (totalYears <= 2) {
    // Fresher: 1 page, fewer bullets
    return roles.map((_, i) => i === 0 ? 4 : 3);
  } else if (totalYears <= 12) {
    // Professional: 2 pages
    return roles.map((_, i) => {
      if (i === 0) return 7;  // Most recent
      if (i === 1) return 5;
      if (i === 2) return 4;
      return 3;               // Older roles
    });
  } else {
    // Executive: 2-3 pages
    return roles.map((_, i) => {
      if (i === 0) return 8;
      if (i === 1) return 6;
      if (i === 2) return 5;
      if (i === 3) return 4;
      return 3;
    });
  }
}

// ============================================
// SYSTEM PROMPTS — one per experience level
// ============================================
const SYSTEM_PROMPTS = {
  fresher: `You are an expert resume writer specializing in entry-level candidates.
STRICT RULES:
1. Output ONLY valid JSON. No text before or after.
2. NEVER fabricate companies, roles, dates, or experience. Use ONLY provided data.
3. Focus on: projects, internships, academic achievements, certifications, hackathons, GitHub work.
4. Summary: Write as "Recent Computer Science graduate with..." — never "seeking opportunity".
5. Every bullet starts with a power verb. Include technologies used and outcome.
6. Skills grouped by category. Never list single skills as separate categories.
7. If candidate has internship experience, treat it as professional experience.
8. Projects section is CRITICAL for freshers — make it detailed.
9. No <think> blocks. No markdown. Pure JSON only.`,

  professional: `You are an Executive Resume Writer, ATS Optimization Expert, and Senior Technical Recruiter with 20+ years Fortune 500 experience.
STRICT RULES:
1. Output ONLY valid JSON. No text before or after.
2. NEVER fabricate companies, roles, dates, achievements, or metrics. Use ONLY provided data.
3. Summary: 6-8 line executive summary including total experience, specialization, industry exposure, project count, key business achievement, and recruiter keywords. Must sound like written by a Fortune 500 recruiter.
4. Every bullet MUST follow: Action Verb + Technology/Business Process + Business Impact + Measured Result. Use STAR framework.
5. Bullets carry metrics ONLY where the candidate supplied them. Where a number belongs but was not supplied, use the [ADD METRIC: ...] placeholder. Never estimate.
6. Skills grouped into professional categories: Primary Technologies, Cloud Platforms, Programming Languages, Frameworks, Databases, DevOps, Monitoring, Methodologies. 3+ skills per category.
7. Achievements section: Top 4-6 career wins. Include numbers ONLY where the candidate gave them; otherwise state the win plainly and add an [ADD METRIC: ...] placeholder.
8. NEVER use: Responsible for, Worked on, Involved in, Handled, Helped with, Duties included, Participated in.
9. ONLY use power verbs: Architected, Spearheaded, Delivered, Reduced, Automated, Designed, Led, Implemented, Optimized, Orchestrated, Streamlined, Engineered, Accelerated, Pioneered, Deployed, Migrated, Transformed, Scaled.
10. Professional Highlights: only cards you can fill from the candidate's own data (e.g. Total Experience). Omit any card you would have to guess at.
11. Resume must pass ATS parsing (Workday, Greenhouse, Taleo, iCIMS) and read well to a US recruiter on LinkedIn or Indeed.
12. No <think> blocks. No markdown. Pure JSON only.`,

  executive: `You are an Executive Resume Writer and Hiring Manager with 20+ years recruiting for Fortune 500 companies.
STRICT RULES:
1. Output ONLY valid JSON. No text before or after.
2. NEVER fabricate companies, roles, dates, or achievements. Use ONLY provided data.
3. Summary: 6-8 line executive summary. Strategic leadership focus. Mention P&L ownership, team sizes, global scope, digital transformation, enterprise-scale impact. Must sound like written by a Fortune 500 executive recruiter.
4. Professional Highlights: 6-8 premium executive highlight cards (Total Experience, Enterprise Projects, Fortune 500 Clients, End-to-End Implementations, Business Impact, Certifications, Leadership Experience).
5. Achievements: Focus on organizational impact — revenue growth, cost reduction, team building, process transformation, SLA improvements. Use the candidate's own figures only; where none were given, use an [ADD METRIC: ...] placeholder.
6. Every bullet: Action Verb + Technology/Strategy + Business Impact + Measured Result at SCALE. Example: "Spearheaded enterprise-wide cloud migration for 15 microservices, reducing infrastructure costs by $4,200/month and achieving 99.9% uptime SLA."
7. Include: cross-functional leadership, stakeholder management, vendor management, strategic planning, P&L accountability.
8. Recent roles: 8-10 detailed STAR bullets. Older roles: 3-4 bullets showing career progression.
9. Skills emphasize: architecture decisions, platform strategy, compliance frameworks (HIPAA, SOC2, PCI), team leadership, FinOps.
10. NEVER use: Responsible for, Worked on, Involved in, Handled. ONLY power verbs: Architected, Spearheaded, Orchestrated, Championed, Pioneered, Transformed.
11. Must pass ATS parsing (Workday, Greenhouse, Taleo, iCIMS) and read well to US executive recruiters.
12. No <think> blocks. No markdown. Pure JSON only.`
};

// ============================================
// USER PROMPT BUILDER — assembles all data
// ============================================
function buildUserPrompt(userData) {
  const {
    fullName, email, phone, location, linkedin, github, portfolio,
    targetTitle, targetCompany, industry, totalExp, careerLevel,
    summary, techSkills, softSkills, achievements,
    degree, university, gradYear, certifications, additionalEdu,
    experience, // array of { title, company, start, end, location, details }
    existingResume, backgroundDesc,
    jobDescription, resumeLang, targetCountry
  } = userData;

  const bulletCounts = getBulletCounts(
    parseInt(totalExp) || 0,
    experience || []
  );

  let prompt = `Generate a professional resume in JSON format for this candidate.

CANDIDATE DATA (use EXACTLY — never change or invent):
Name: ${fullName}
Email: ${email}
Phone: ${phone}
Location: ${location}
${linkedin ? "LinkedIn: " + linkedin : ""}
${github ? "GitHub: " + github : ""}
${portfolio ? "Portfolio: " + portfolio : ""}

Target Role: ${targetTitle || "Not specified"}
${targetCompany ? "Target Company: " + targetCompany : ""}
Industry: ${industry || "Technology"}
Total Experience: ${totalExp || "0"} years
Career Level: ${careerLevel}

${summary ? "Candidate's Own Summary: " + summary : "Generate a professional summary."}

EDUCATION (use EXACTLY as provided):
${degree || "[Not provided]"} ${university ? "— " + university : ""} ${gradYear ? "(" + gradYear + ")" : ""}
${additionalEdu ? "Additional: " + additionalEdu : ""}

${certifications ? "CERTIFICATIONS (use EXACTLY): " + certifications : "No certifications provided."}

TECHNICAL SKILLS: ${techSkills || "Extract from experience below."}
${softSkills ? "SOFT SKILLS: " + softSkills : ""}

${achievements ? "KEY ACHIEVEMENTS:\n" + achievements : ""}
`;

  // Add experience with bullet count instructions
  if (experience && experience.length > 0) {
    prompt += "\nWORK EXPERIENCE (use EXACTLY these companies and titles — NEVER invent):\n";
    experience.forEach((exp, i) => {
      const bc = bulletCounts[i] || 3;
      prompt += `\nROLE ${i + 1}: ${exp.title} at ${exp.company}`;
      prompt += ` (${exp.start || "?"} — ${exp.end || "?"})`;
      if (exp.location) prompt += `, ${exp.location}`;
      prompt += `\nGenerate EXACTLY ${bc} STAR-format bullets for this role.`;
      if (exp.details) prompt += `\nDetails: ${exp.details}`;
      prompt += "\n";
    });
  }

  // Add existing resume if pasted
  if (existingResume) {
    prompt += `\nEXISTING RESUME (extract ALL info from this — improve writing but keep facts):
"""
${existingResume.substring(0, 4000)}
"""`;
  }

  if (backgroundDesc) {
    prompt += `\nBACKGROUND DESCRIPTION (extract info, structure professionally):
"""
${backgroundDesc.substring(0, 3000)}
"""`;
  }

  // Job description for keyword matching
  if (jobDescription) {
    prompt += `\nTARGET JOB DESCRIPTION (match keywords naturally):
"""
${jobDescription.substring(0, 3000)}
"""`;
  }

  // Language and country rules
  if (resumeLang && resumeLang !== "English") {
    prompt += `\nLANGUAGE: Write ALL content in ${resumeLang}. Keep technical terms in English.`;
  }
  if (targetCountry && targetCountry !== "Global") {
    prompt += `\nCOUNTRY: Follow ${targetCountry} resume conventions.`;
  }

  // Strict output rules
  prompt += `

OUTPUT RULES:
1. Return ONLY valid JSON matching the schema. No other text.
2. personal.fullName MUST be "${fullName}" — never change it.
3. Every company name and job title MUST match what I provided above.
4. Every bullet MUST start with a different power verb.
5. Include a metric ONLY where the candidate supplied one. Never invent a number to hit a quota.
6. Skills grouped into categories with 3+ skills each.
7. education and certifications MUST use EXACT data I provided — NEVER invent.
8. If I didn't provide certain data, use null or empty array — NEVER fabricate.

${RESUME_SCHEMA_INSTRUCTION}`;

  return prompt;
}

// ============================================
// GET SYSTEM PROMPT based on experience level
// ============================================
// The metric rule applies everywhere. The US conventions do not — telling a
// candidate targeting Germany to drop their photo would be wrong, since a
// Lebenslauf normally carries one. Default to US when no country is given,
// because that is who this product is for.
function isUSTarget(targetCountry) {
  if (!targetCountry) return true;
  const c = String(targetCountry).trim().toLowerCase();
  return c === '' || c === 'global' || c === 'us' || c === 'usa' ||
         c === 'united states' || c === 'united states of america' || c === 'america';
}

function getSystemPrompt(totalYears, targetCountry) {
  let base;
  if (totalYears <= 2) base = SYSTEM_PROMPTS.fresher;
  else if (totalYears <= 12) base = SYSTEM_PROMPTS.professional;
  else base = SYSTEM_PROMPTS.executive;

  let out = base + "\n" + METRIC_RULE;
  if (isUSTarget(targetCountry)) out += "\n" + US_CONVENTIONS;
  return out;
}

export {
  buildUserPrompt,
  METRIC_RULE,
  US_CONVENTIONS,
  isUSTarget,
  getSystemPrompt,
  getBulletCounts,
  POWER_VERBS,
  BANNED_WORDS
};
