// ============================================
// ResumeGPT HTML Renderer v3 — Templates + Colors
// Converts Resume JSON → Professional HTML for Puppeteer PDF
// ============================================

const COLOR_THEMES = {
  black:  { primary: "#000000", accent: "#333333", line: "#000000", light: "#f5f5f5" },
  blue:   { primary: "#1A56DB", accent: "#1E40AF", line: "#1A56DB", light: "#EFF6FF" },
  green:  { primary: "#15803D", accent: "#166534", line: "#15803D", light: "#F0FDF4" },
  purple: { primary: "#7C3AED", accent: "#6D28D9", line: "#7C3AED", light: "#F5F3FF" },
  red:    { primary: "#DC2626", accent: "#B91C1C", line: "#DC2626", light: "#FEF2F2" },
  teal:   { primary: "#0D9488", accent: "#0F766E", line: "#0D9488", light: "#F0FDFA" }
};

function renderResumeHTML(resumeJSON, options = {}) {
  const theme = COLOR_THEMES[options.color] || COLOR_THEMES.black;
  const align = options.align || "center";
  const p = resumeJSON.personal || {};
  const name = (p.fullName || "").toUpperCase();
  const title = p.title || "";
  const contactParts = [p.email, p.phone, p.linkedin, p.github, p.portfolio, p.location].filter(Boolean);
  const contactLine = contactParts.join("  |  ");

  let html = `<div class="resume-container">`;

  html += `<div class="header" style="text-align:${align}">`;
  html += `<div class="name" style="color:${theme.primary}">${name}</div>`;
  if (title) html += `<div class="title" style="color:${theme.accent}">${title}</div>`;
  if (contactLine) html += `<div class="contact" style="border-bottom-color:${theme.line}">${contactLine}</div>`;
  html += `</div>`;

  function secHead(t) { return `<div class="section-header" style="color:${theme.primary};border-bottom-color:${theme.line}">${t}</div>`; }

  // Professional Highlights
  if (resumeJSON.highlights && resumeJSON.highlights.length > 0) {
    html += `<div class="section">${secHead("PROFESSIONAL HIGHLIGHTS")}<div style="display:flex;flex-wrap:wrap;gap:4px 16px">`;
    resumeJSON.highlights.forEach(hl => { html += `<div class="bullet" style="margin:0">\u2713 ${hl}</div>`; });
    html += `</div></div>`;
  }

  if (resumeJSON.summary && resumeJSON.summary.trim()) {
    html += `<div class="section">${secHead("PROFESSIONAL SUMMARY")}<div class="text">${resumeJSON.summary}</div></div>`;
  }

  if (resumeJSON.achievements && resumeJSON.achievements.length > 0) {
    const valid = resumeJSON.achievements.filter(a => { const t = typeof a === "string" ? a : a.text; return t && t.trim(); });
    if (valid.length) {
      html += `<div class="section">${secHead("KEY ACHIEVEMENTS")}`;
      valid.forEach(a => { const text = typeof a === "string" ? a : a.text; html += `<div class="bullet">\u2022 ${text}</div>`; });
      html += `</div>`;
    }
  }

  if (resumeJSON.skills && resumeJSON.skills.length > 0) {
    const valid = resumeJSON.skills.filter(s => s.category && s.items && s.items.length);
    if (valid.length) {
      html += `<div class="section">${secHead("TECHNICAL SKILLS")}`;
      valid.forEach(cat => { html += `<div class="skills-line"><span class="skills-cat" style="color:${theme.accent}">${cat.category}:</span> ${cat.items.join(", ")}</div>`; });
      html += `</div>`;
    }
  }

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
      if (exp.bullets && exp.bullets.length) {
        exp.bullets.forEach(b => { const text = typeof b === "string" ? b : b.text; if (text && text.trim()) html += `<div class="bullet">\u2022 ${text}</div>`; });
      }
      html += `</div>`;
    });
    html += `</div>`;
  }

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

  if (resumeJSON.certifications && resumeJSON.certifications.length > 0) {
    const valid = resumeJSON.certifications.filter(c => c.name && c.name.trim());
    if (valid.length) {
      html += `<div class="section">${secHead("CERTIFICATIONS")}`;
      valid.forEach(cert => {
        let line = cert.name;
        if (cert.issuer) line += ` \u2014 ${cert.issuer}`;
        if (cert.year) line += ` (${cert.year})`;
        html += `<div class="text">${line}</div>`;
      });
      html += `</div>`;
    }
  }

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

  if (resumeJSON.strengths && resumeJSON.strengths.length > 0) {
    const valid = resumeJSON.strengths.filter(s => s && s.trim());
    if (valid.length) {
      html += `<div class="section">${secHead("PROFESSIONAL STRENGTHS")}<div class="text">${valid.join("  |  ")}</div></div>`;
    }
  }

  html += `</div>`;
  return html;
}

const RESUME_CSS = `
@page { size: A4; margin: 12mm 14mm 12mm 14mm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #000; font-size: 9pt; line-height: 1.4; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.resume-container { width: 100%; }
.header { margin-bottom: 6px; padding-bottom: 6px; border-bottom: 1.5px solid #000; }
.name { font-size: 18pt; font-weight: 900; letter-spacing: 1.5px; margin-bottom: 2px; }
.title { font-size: 9.5pt; margin-bottom: 3px; }
.contact { font-size: 8pt; color: #555; }
.section { margin-bottom: 4px; }
.section-header { font-size: 9.5pt; font-weight: bold; margin-top: 6px; padding-bottom: 1.5px; border-bottom: 1px solid #000; margin-bottom: 3px; break-after: avoid; page-break-after: avoid; }
.job { margin-bottom: 4px; }
.job-header { display: flex; justify-content: space-between; align-items: baseline; margin-top: 4px; margin-bottom: 1px; break-after: avoid; page-break-after: avoid; }
.job-title { font-size: 9.5pt; font-weight: bold; }
.job-date { font-size: 8.5pt; color: #555; font-style: italic; }
.company { font-size: 8.5pt; color: #555; font-style: italic; margin-bottom: 2px; }
.bullet { font-size: 9pt; margin-left: 4px; margin-bottom: 1.5px; text-indent: -10px; padding-left: 14px; line-height: 1.35; }
.text { font-size: 9pt; margin-bottom: 1.5px; line-height: 1.4; }
.skills-line { font-size: 8.5pt; margin-bottom: 1.5px; line-height: 1.35; }
.skills-cat { font-weight: bold; }
.edu-line { font-size: 9pt; margin-bottom: 2px; }
`;

export { renderResumeHTML, RESUME_CSS };
