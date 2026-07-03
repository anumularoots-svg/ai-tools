// ============================================
// ResumeGPT HTML Renderer v2
// Converts Resume JSON → Professional HTML
// Fixes: dates, empty sections, spacing, layout
// ============================================

function renderResumeHTML(resumeJSON, options = {}) {
  const { align = "center" } = options;
  const p = resumeJSON.personal || {};
  const name = (p.fullName || "").toUpperCase();
  const title = p.title || "";
  const contactParts = [p.email, p.phone, p.linkedin, p.github, p.portfolio, p.location].filter(Boolean);
  const contactLine = contactParts.join("  |  ");

  let html = `<div class="resume-container">`;

  // ---- HEADER ----
  html += `<div class="header" style="text-align:${align}">`;
  html += `<div class="name">${name}</div>`;
  if (title) html += `<div class="title">${title}</div>`;
  if (contactLine) html += `<div class="contact">${contactLine}</div>`;
  html += `</div>`;

  // ---- SUMMARY ----
  if (resumeJSON.summary && resumeJSON.summary.trim()) {
    html += `<div class="section">`;
    html += `<div class="section-header">PROFESSIONAL SUMMARY</div>`;
    html += `<div class="text">${resumeJSON.summary}</div>`;
    html += `</div>`;
  }

  // ---- KEY ACHIEVEMENTS ----
  if (resumeJSON.achievements && resumeJSON.achievements.length > 0) {
    const valid = resumeJSON.achievements.filter(a => {
      const t = typeof a === "string" ? a : a.text;
      return t && t.trim();
    });
    if (valid.length) {
      html += `<div class="section">`;
      html += `<div class="section-header">KEY ACHIEVEMENTS</div>`;
      valid.forEach(a => {
        const text = typeof a === "string" ? a : a.text;
        html += `<div class="bullet">\u2022 ${text}</div>`;
      });
      html += `</div>`;
    }
  }

  // ---- TECHNICAL SKILLS ----
  if (resumeJSON.skills && resumeJSON.skills.length > 0) {
    const valid = resumeJSON.skills.filter(s => s.category && s.items && s.items.length);
    if (valid.length) {
      html += `<div class="section">`;
      html += `<div class="section-header">TECHNICAL SKILLS</div>`;
      valid.forEach(cat => {
        html += `<div class="skills-line"><span class="skills-cat">${cat.category}:</span> ${cat.items.join(", ")}</div>`;
      });
      html += `</div>`;
    }
  }

  // ---- EXPERIENCE ----
  if (resumeJSON.experience && resumeJSON.experience.length > 0) {
    html += `<div class="section">`;
    html += `<div class="section-header">PROFESSIONAL EXPERIENCE</div>`;
    resumeJSON.experience.forEach(exp => {
      html += `<div class="job">`;
      // Format dates properly
      const startDate = (exp.startDate || "").trim();
      const endDate = (exp.endDate || "").trim();
      const dateStr = [startDate, endDate].filter(Boolean).join(" \u2014 ");

      html += `<div class="job-header">`;
      html += `<span class="job-title">${(exp.title || "").toUpperCase()}</span>`;
      if (dateStr) html += `<span class="job-date">${dateStr}</span>`;
      html += `</div>`;

      const companyParts = [exp.company, exp.location].filter(Boolean).join(", ");
      if (companyParts) html += `<div class="company">${companyParts}</div>`;

      if (exp.bullets && exp.bullets.length) {
        exp.bullets.forEach(b => {
          const text = typeof b === "string" ? b : b.text;
          if (text && text.trim()) {
            html += `<div class="bullet">\u2022 ${text}</div>`;
          }
        });
      }
      html += `</div>`;
    });
    html += `</div>`;
  }

  // ---- EDUCATION ----
  if (resumeJSON.education && resumeJSON.education.length > 0) {
    const valid = resumeJSON.education.filter(e => e.degree || e.institution);
    if (valid.length) {
      html += `<div class="section">`;
      html += `<div class="section-header">EDUCATION</div>`;
      valid.forEach(edu => {
        html += `<div class="edu-line"><strong>${edu.degree || ""}</strong>`;
        if (edu.institution) html += ` \u2014 ${edu.institution}`;
        if (edu.year) html += ` (${edu.year})`;
        html += `</div>`;
        if (edu.gpa) html += `<div class="text">GPA: ${edu.gpa}</div>`;
      });
      html += `</div>`;
    }
  }

  // ---- CERTIFICATIONS ----
  if (resumeJSON.certifications && resumeJSON.certifications.length > 0) {
    const valid = resumeJSON.certifications.filter(c => c.name && c.name.trim());
    if (valid.length) {
      html += `<div class="section">`;
      html += `<div class="section-header">CERTIFICATIONS</div>`;
      valid.forEach(cert => {
        let line = cert.name;
        if (cert.issuer) line += ` \u2014 ${cert.issuer}`;
        if (cert.year) line += ` (${cert.year})`;
        if (cert.status === "target") line += " [Target]";
        if (cert.status === "in-progress") line += " [In Progress]";
        html += `<div class="text">${line}</div>`;
      });
      html += `</div>`;
    }
  }

  // ---- PROJECTS ----
  if (resumeJSON.projects && resumeJSON.projects.length > 0) {
    html += `<div class="section">`;
    html += `<div class="section-header">PROJECTS</div>`;
    resumeJSON.projects.forEach(proj => {
      html += `<div class="job">`;
      html += `<div class="job-title">${proj.name || ""}</div>`;
      if (proj.technologies && proj.technologies.length) {
        html += `<div class="text"><em>Technologies: ${proj.technologies.join(", ")}</em></div>`;
      }
      if (proj.description) html += `<div class="text">${proj.description}</div>`;
      if (proj.bullets) {
        proj.bullets.forEach(b => {
          const t = typeof b === "string" ? b : (b.text || "");
          if (t.trim()) html += `<div class="bullet">\u2022 ${t}</div>`;
        });
      }
      html += `</div>`;
    });
    html += `</div>`;
  }

  // ---- STRENGTHS ----
  if (resumeJSON.strengths && resumeJSON.strengths.length > 0) {
    const valid = resumeJSON.strengths.filter(s => s && s.trim());
    if (valid.length) {
      html += `<div class="section">`;
      html += `<div class="section-header">PROFESSIONAL STRENGTHS</div>`;
      html += `<div class="text">${valid.join("  |  ")}</div>`;
      html += `</div>`;
    }
  }

  html += `</div>`;
  return html;
}

// ---- PRINT CSS for Puppeteer PDF ----
const RESUME_CSS = `
@page {
  size: A4;
  margin: 15mm 16mm 14mm 16mm;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
  color: #000;
  font-size: 9.5pt;
  line-height: 1.45;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.resume-container { width: 100%; }
.header {
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1.5px solid #000;
}
.name { font-size: 20pt; font-weight: 900; letter-spacing: 1.5px; margin-bottom: 3px; color: #000; }
.title { font-size: 11pt; color: #444; margin-bottom: 4px; }
.contact { font-size: 8.5pt; color: #666; }
.section { margin-bottom: 6px; }
.section-header {
  font-size: 10.5pt;
  font-weight: bold;
  margin-top: 10px;
  padding-bottom: 2px;
  border-bottom: 1px solid #000;
  margin-bottom: 5px;
  break-after: avoid;
  page-break-after: avoid;
}
.job {
  margin-bottom: 6px;
  break-inside: avoid;
  page-break-inside: avoid;
}
.job-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-top: 6px;
  margin-bottom: 1px;
  break-after: avoid;
  page-break-after: avoid;
  break-inside: avoid;
  page-break-inside: avoid;
}
.job-title { font-size: 10pt; font-weight: bold; color: #000; }
.job-date { font-size: 9pt; color: #555; font-style: italic; }
.company { font-size: 9pt; color: #555; font-style: italic; margin-bottom: 4px; }
.bullet {
  font-size: 9.5pt;
  margin-left: 4px;
  margin-bottom: 2.5px;
  text-indent: -12px;
  padding-left: 16px;
}
.text { font-size: 9.5pt; margin-bottom: 2px; }
.skills-line { font-size: 9pt; margin-bottom: 2px; }
.skills-cat { font-weight: bold; }
.edu-line { font-size: 9.5pt; margin-bottom: 3px; }
`;

export { renderResumeHTML, RESUME_CSS };
