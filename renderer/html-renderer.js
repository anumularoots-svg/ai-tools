// ResumeGPT HTML Renderer v4 — Full 14-Section Support
const COLOR_THEMES = {
  black:  { primary: "#000000", accent: "#333333", line: "#000000", light: "#f5f5f5" },
  blue:   { primary: "#1A56DB", accent: "#1E40AF", line: "#1A56DB", light: "#EFF6FF" },
  green:  { primary: "#15803D", accent: "#166534", line: "#15803D", light: "#F0FDF4" },
  purple: { primary: "#7C3AED", accent: "#6D28D9", line: "#7C3AED", light: "#F5F3FF" },
  red:    { primary: "#DC2626", accent: "#B91C1C", line: "#DC2626", light: "#FEF2F2" },
  teal:   { primary: "#0D9488", accent: "#0F766E", line: "#0D9488", light: "#F0FDFA" },
  navy:   { primary: "#1A237E", accent: "#283593", line: "#1A237E", light: "#E8EAF6" },
  slate:  { primary: "#28303C", accent: "#3F4756", line: "#28303C", light: "#F1F5F9" },
  violet: { primary: "#6C3CE1", accent: "#5B32C0", line: "#6C3CE1", light: "#F3EEFF" }
};

// The `template` option used to be accepted and then dropped on the floor --
// renderResumeHTML only ever read options.color and options.align, so
// api/pdf.js passed a template id that changed nothing. These map the same ten
// ids the browser builder uses onto the knobs this renderer does have.
//
// This is a colour/alignment mapping, NOT the full ten-template treatment the
// client-side jsPDF layout applies (fonts, chip style, table on/off, density).
// It exists so the parameter is honest rather than silently inert.
const TEMPLATE_STYLES = {
  Harvard_Classic:    { color: "black",  align: "center" },
  Stanford_Clean:     { color: "slate",  align: "left"   },
  Google_XYZ:         { color: "blue",   align: "left"   },
  ATS_Ultra_Safe:     { color: "black",  align: "left"   },
  Executive_Standard: { color: "navy",   align: "center" },
  Modern_Minimal:     { color: "slate",  align: "left"   },
  Corporate_Formal:   { color: "navy",   align: "center" },
  MIT_Technical:      { color: "teal",   align: "left"   },
  McKinsey_Compact:   { color: "black",  align: "left"   },
  FAANG_Standard:     { color: "violet", align: "left"   }
};

function renderResumeHTML(resumeJSON, options = {}) {
  // An explicit color/align always wins; the template supplies the default.
  const tpl = TEMPLATE_STYLES[options.template] || {};
  const theme = COLOR_THEMES[options.color || tpl.color] || COLOR_THEMES.black;
  const align = options.align || tpl.align || "center";
  const p = resumeJSON.personal || {};
  const name = (p.fullName || "").toUpperCase();
  const title = p.title || "";
  const contactParts = [p.email, p.phone, p.linkedin, p.github, p.portfolio, p.location].filter(Boolean);
  const contactLine = contactParts.join("  |  ");

  let html = `<div class="resume-container">`;

  // 1-3. Header
  html += `<div class="header" style="text-align:${align}">`;
  html += `<div class="name" style="color:${theme.primary}">${name}</div>`;
  if (title) html += `<div class="title" style="color:${theme.accent}">${title}</div>`;
  if (contactLine) html += `<div class="contact" style="border-bottom-color:${theme.line}">${contactLine}</div>`;
  html += `</div>`;

  function secHead(t) { return `<div class="section-header" style="color:${theme.primary};border-bottom-color:${theme.line}">${t}</div>`; }

  // 4. Professional Highlights
  if (resumeJSON.highlights && resumeJSON.highlights.length > 0) {
    html += `<div class="section">${secHead("PROFESSIONAL HIGHLIGHTS")}<div class="highlights-row">`;
    resumeJSON.highlights.forEach(hl => { html += `<span class="hl-item">\u2713 ${hl}</span>`; });
    html += `</div></div>`;
  }

  // 5. Professional Summary
  if (resumeJSON.summary && resumeJSON.summary.trim()) {
    html += `<div class="section">${secHead("PROFESSIONAL SUMMARY")}<div class="text">${resumeJSON.summary}</div></div>`;
  }

  // 6. Technical Skills
  if (resumeJSON.skills && resumeJSON.skills.length > 0) {
    const valid = resumeJSON.skills.filter(s => s.category && s.items && s.items.length);
    if (valid.length) {
      html += `<div class="section">${secHead("TECHNICAL SKILLS")}`;
      valid.forEach(cat => { html += `<div class="skills-line"><span class="skills-cat" style="color:${theme.accent}">${cat.category}:</span> ${cat.items.join(", ")}</div>`; });
      html += `</div>`;
    }
  }

  // 7. Certifications
  if (resumeJSON.certifications && resumeJSON.certifications.length > 0) {
    const valid = resumeJSON.certifications.filter(c => c.name && c.name.trim());
    if (valid.length) {
      html += `<div class="section">${secHead("CERTIFICATIONS")}`;
      valid.forEach(cert => {
        let line = cert.name;
        if (cert.issuer) line += ` \u2014 ${cert.issuer}`;
        if (cert.year) line += ` (${cert.year})`;
        if (cert.status === "in_progress") line += " [In Progress]";
        html += `<div class="text">${line}</div>`;
      });
      html += `</div>`;
    }
  }

  // 8-9. Professional Experience with client/project metadata
  if (resumeJSON.experience && resumeJSON.experience.length > 0) {
    html += `<div class="section">${secHead("PROFESSIONAL EXPERIENCE")}`;
    resumeJSON.experience.forEach(exp => {
      html += `<div class="job">`;
      const dateStr = [exp.startDate, exp.endDate].filter(Boolean).join(" \u2014 ");
      html += `<div class="job-header"><span class="job-title" style="color:${theme.primary}">${(exp.title || "").toUpperCase()}</span>`;
      if (dateStr) html += `<span class="job-date">${dateStr}</span>`;
      html += `</div>`;
      const cp = [exp.company, exp.location].filter(Boolean).join(", ");
      if (cp) html += `<div class="company">${cp}</div>`;
      // Client/Project metadata
      const meta = [exp.client ? "Client: " + exp.client : "", exp.projectType ? "Project: " + exp.projectType : "", exp.teamSize ? "Team: " + exp.teamSize : ""].filter(Boolean).join("  |  ");
      if (meta) html += `<div class="company">${meta}</div>`;
      if (exp.bullets && exp.bullets.length) {
        exp.bullets.forEach(b => { const text = typeof b === "string" ? b : b.text; if (text && text.trim()) html += `<div class="bullet">\u2022 ${text}</div>`; });
      }
      html += `</div>`;
    });
    html += `</div>`;
  }

  // 10. Quantified Achievements
  if (resumeJSON.quantifiedAchievements && resumeJSON.quantifiedAchievements.length > 0) {
    html += `<div class="section">${secHead("QUANTIFIED ACHIEVEMENTS")}`;
    resumeJSON.quantifiedAchievements.forEach(a => {
      const txt = typeof a === "string" ? a : a.text || a;
      html += `<div class="bullet">\u2022 ${txt}</div>`;
    });
    html += `</div>`;
  } else if (resumeJSON.achievements && resumeJSON.achievements.length > 0) {
    const valid = resumeJSON.achievements.filter(a => { const t = typeof a === "string" ? a : a.text; return t && t.trim(); });
    if (valid.length) {
      html += `<div class="section">${secHead("KEY ACHIEVEMENTS")}`;
      valid.forEach(a => { const text = typeof a === "string" ? a : a.text; html += `<div class="bullet">\u2022 ${text}</div>`; });
      html += `</div>`;
    }
  }

  // 11. Project Portfolio Table
  if (resumeJSON.projectPortfolio && resumeJSON.projectPortfolio.length > 0) {
    html += `<div class="section">${secHead("PROJECT PORTFOLIO")}`;
    html += `<table class="portfolio-table"><tr><th>Client</th><th>Project</th><th>Type</th><th>Role</th><th>Duration</th><th>Team</th></tr>`;
    resumeJSON.projectPortfolio.forEach(proj => {
      html += `<tr><td>${proj.client||""}</td><td>${proj.project||""}</td><td>${proj.type||""}</td><td>${proj.role||""}</td><td>${proj.duration||""}</td><td>${proj.teamSize||""}</td></tr>`;
    });
    html += `</table></div>`;
  }

  // 12. Education
  if (resumeJSON.education && resumeJSON.education.length > 0) {
    const valid = resumeJSON.education.filter(e => e.degree || e.institution);
    if (valid.length) {
      html += `<div class="section">${secHead("EDUCATION")}`;
      valid.forEach(edu => {
        html += `<div class="edu-line"><strong>${edu.degree || ""}</strong>`;
        if (edu.institution) html += ` \u2014 ${edu.institution}`;
        if (edu.year) html += ` (${edu.year})`;
        html += `</div>`;
      });
      html += `</div>`;
    }
  }

  // 13. Core Competencies
  if (resumeJSON.coreCompetencies && resumeJSON.coreCompetencies.length > 0) {
    html += `<div class="section">${secHead("CORE COMPETENCIES")}<div class="text">${resumeJSON.coreCompetencies.join("  |  ")}</div></div>`;
  } else if (resumeJSON.strengths && resumeJSON.strengths.length > 0) {
    const valid = resumeJSON.strengths.filter(s => s && s.trim());
    if (valid.length) {
      html += `<div class="section">${secHead("CORE COMPETENCIES")}<div class="text">${valid.join("  |  ")}</div></div>`;
    }
  }

  // 14. Additional Information
  if (resumeJSON.additionalInfo) {
    const ai = resumeJSON.additionalInfo;
    const parts = [ai.currentLocation ? "Current Location: " + ai.currentLocation : "", ai.preferredLocation ? "Preferred Location: " + ai.preferredLocation : "", ai.languages ? "Languages: " + ai.languages : "", ai.noticePeriod ? "Notice Period: " + ai.noticePeriod : "", ai.workAuthorization ? "Work Authorization: " + ai.workAuthorization : ""].filter(Boolean);
    if (parts.length) {
      html += `<div class="section">${secHead("ADDITIONAL INFORMATION")}<div class="text">${parts.join("  |  ")}</div></div>`;
    }
  }

  // Projects (for freshers)
  if (resumeJSON.projects && resumeJSON.projects.length > 0) {
    html += `<div class="section">${secHead("PROJECTS")}`;
    resumeJSON.projects.forEach(proj => {
      html += `<div class="job"><div class="job-title" style="color:${theme.primary}">${proj.name || ""}</div>`;
      if (proj.technologies?.length) html += `<div class="text"><em>Technologies: ${proj.technologies.join(", ")}</em></div>`;
      if (proj.description) html += `<div class="text">${proj.description}</div>`;
      if (proj.bullets) proj.bullets.forEach(b => { const t = typeof b === "string" ? b : (b.text || ""); if (t.trim()) html += `<div class="bullet">\u2022 ${t}</div>`; });
      html += `</div>`;
    });
    html += `</div>`;
  }

  html += `</div>`;
  return html;
}

// Every size is derived from two custom properties so the fitter can rescale
// the document without CSS `zoom`.
//
//   --fs  font scale   -- multiplies type only
//   --ls  leading scale -- multiplies line-height and every vertical gap
//
// zoom was the old mechanism and it was wrong twice over: it scaled the box as
// well as the type, so shrinking to win a page also narrowed the content and
// left a dead gutter on the right, and reading scrollHeight back off a zoomed
// element double-counts the scale so the fitter could not see its own effect.
const RESUME_CSS = `
@page { size: A4; margin: 12mm 14mm 10mm 14mm; }
:root { --fs: 1; --ls: 1; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #000; font-size: calc(8.5pt * var(--fs)); line-height: calc(1.35 * var(--ls)); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.resume-container { width: 100%; }
.header { margin-bottom: calc(5px * var(--ls)); padding-bottom: calc(5px * var(--ls)); border-bottom: 1.5px solid #000; }
.name { font-size: calc(17pt * var(--fs)); font-weight: 900; letter-spacing: 1.5px; margin-bottom: calc(2px * var(--ls)); }
.title { font-size: calc(9pt * var(--fs)); margin-bottom: calc(2px * var(--ls)); }
.contact { font-size: calc(8pt * var(--fs)); color: #555; }
.section { margin-bottom: calc(2px * var(--ls)); }
.section-header { font-size: calc(9pt * var(--fs)); font-weight: bold; text-transform: uppercase; margin-top: calc(4px * var(--ls)); padding-bottom: 1px; border-bottom: 1px solid #000; margin-bottom: calc(3px * var(--ls)); break-after: avoid; page-break-after: avoid; }
.highlights-row { display: flex; flex-wrap: wrap; gap: calc(2px * var(--ls)) 14px; }
.hl-item { font-size: calc(8.5pt * var(--fs)); white-space: nowrap; }
.job { margin-bottom: calc(3px * var(--ls)); }
.job-header { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin-top: calc(3px * var(--ls)); margin-bottom: 0; break-after: avoid; page-break-after: avoid; }
.job-title { font-size: calc(9pt * var(--fs)); font-weight: bold; }
.job-date { font-size: calc(8pt * var(--fs)); color: #555; font-style: italic; white-space: nowrap; flex: none; }
.company { font-size: calc(8pt * var(--fs)); color: #555; font-style: italic; margin-bottom: calc(1px * var(--ls)); }
.bullet { font-size: calc(8.5pt * var(--fs)); margin-left: 4px; margin-bottom: calc(1px * var(--ls)); text-indent: -10px; padding-left: 14px; line-height: calc(1.32 * var(--ls)); page-break-inside: avoid; -webkit-column-break-inside: avoid; display: table; width: 100%; }
.text { font-size: calc(8.5pt * var(--fs)); margin-bottom: calc(1px * var(--ls)); line-height: calc(1.35 * var(--ls)); }
.skills-line { font-size: calc(8.5pt * var(--fs)); margin-bottom: calc(1px * var(--ls)); line-height: calc(1.3 * var(--ls)); }
.skills-cat { font-weight: bold; }
.edu-line { font-size: calc(8.5pt * var(--fs)); margin-bottom: calc(2px * var(--ls)); }
.portfolio-table { width: 100%; border-collapse: collapse; font-size: calc(8pt * var(--fs)); margin-top: calc(2px * var(--ls)); }
.portfolio-table th { background: #f5f5f5; font-weight: bold; text-align: left; padding: 2px 4px; border: 0.5px solid #ccc; font-size: calc(7.5pt * var(--fs)); }
.portfolio-table td { padding: 2px 4px; border: 0.5px solid #ddd; font-size: calc(7.5pt * var(--fs)); line-height: calc(1.3 * var(--ls)); }
`;

export { renderResumeHTML, RESUME_CSS };
