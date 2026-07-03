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

  professional: `You are an expert resume writer for mid-career professionals (3-12 years).
STRICT RULES:
1. Output ONLY valid JSON. No text before or after.
2. NEVER fabricate companies, roles, dates, achievements, or metrics. Use ONLY provided data.
3. Summary: "[Title] with [X]+ years of experience in [domain], specializing in [core tech]. Proven track record of [quantified achievement]."
4. Every bullet uses STAR framework: Action Verb + What You Did + Technology Used + Measurable Result.
5. 70%+ bullets must include specific metrics (%, $, time, scale, team size).
6. Skills grouped by category with 3+ skills per category.
7. Achievements section: Top 4-5 career wins with specific numbers.
8. Experience bullets focus on IMPACT not duties. Never "responsible for".
9. No <think> blocks. No markdown. Pure JSON only.`,

  executive: `You are an expert executive resume writer for senior leaders (12+ years).
STRICT RULES:
1. Output ONLY valid JSON. No text before or after.
2. NEVER fabricate companies, roles, dates, or achievements. Use ONLY provided data.
3. Summary: Strategic leadership focus. Mention P&L, team size, global scope, transformation.
4. Achievements: Focus on organizational impact — revenue, cost savings, team building, process transformation.
5. Every bullet shows LEADERSHIP + SCALE + OUTCOME. Example: "Led 25-engineer team to deliver..."
6. Include: cross-functional leadership, stakeholder management, vendor management, strategic planning.
7. Recent roles: detailed (8-10 bullets). Older roles: brief (3-4 bullets showing career progression).
8. Skills emphasize: architecture decisions, platform strategy, compliance frameworks, team leadership.
9. No <think> blocks. No markdown. Pure JSON only.`
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
5. 70%+ of bullets must include a specific metric.
6. Skills grouped into categories with 3+ skills each.
7. education and certifications MUST use EXACT data I provided — NEVER invent.
8. If I didn't provide certain data, use null or empty array — NEVER fabricate.

${RESUME_SCHEMA_INSTRUCTION}`;

  return prompt;
}

// ============================================
// GET SYSTEM PROMPT based on experience level
// ============================================
function getSystemPrompt(totalYears) {
  if (totalYears <= 2) return SYSTEM_PROMPTS.fresher;
  if (totalYears <= 12) return SYSTEM_PROMPTS.professional;
  return SYSTEM_PROMPTS.executive;
}

export {
  buildUserPrompt,
  getSystemPrompt,
  getBulletCounts,
  POWER_VERBS,
  BANNED_WORDS
};
