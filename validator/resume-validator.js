// ============================================
// ResumeGPT Resume Validator v1
// Validates AI JSON output before rendering
// Returns score 0-100 and list of issues
// If score < 85, application should regenerate
// ============================================

import { POWER_VERBS, BANNED_WORDS } from "../prompts/prompt-engine.js";

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

    // Metrics ratio
    if (totalBullets > 0) {
      const metricsRatio = metricsCount / totalBullets;
      if (metricsRatio < 0.5) {
        issues.push({ severity: "major", message: `Only ${Math.round(metricsRatio * 100)}% bullets have metrics (target: 70%+)` });
        score -= 8;
      }
    }

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
    if (!/\d/.test(resumeJSON.summary)) {
      issues.push({ severity: "major", message: "Summary has no quantified metrics" });
      score -= 5;
    }
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

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    passed: score >= 85,
    issues: issues.sort((a, b) => {
      const order = { critical: 0, major: 1, minor: 2 };
      return (order[a.severity] || 3) - (order[b.severity] || 3);
    }),
    summary: `Score: ${score}/100. ${issues.filter(i => i.severity === "critical").length} critical, ${issues.filter(i => i.severity === "major").length} major, ${issues.filter(i => i.severity === "minor").length} minor issues.`
  };
}

export { validateResume };
