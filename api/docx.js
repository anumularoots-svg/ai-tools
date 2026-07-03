// ============================================
// ZapKitt DOCX Resume API v2 — 10 Templates
// Input: Resume JSON + template/color/font/margin options
// Output: Professional DOCX with real template designs
// ============================================

import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, BorderStyle, TabStopType, TabStopPosition,
  convertInchesToTwip, ShadingType, UnderlineType, PageBreak,
  WidthType, Table, TableRow, TableCell, TableBorders
} from "docx";

export default async function handler(req, res) {
  const origins = ["https://zapkitt.com", "https://www.zapkitt.com"];
  const o = req.headers.origin || "";
  res.setHeader("Access-Control-Allow-Origin", origins.includes(o) ? o : origins[0]);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { resumeJSON, fileName, template, color, font, margin } = req.body;
  if (!resumeJSON) return res.status(400).json({ error: "resumeJSON required" });

  try {
    const doc = buildResumeDoc(resumeJSON, { template, color, font, margin });
    const buffer = await Packer.toBuffer(doc);

    const name = fileName || (resumeJSON.personal?.fullName || "Resume").replace(/\s+/g, "_");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${name}_Resume.docx"`);
    res.status(200).send(Buffer.from(buffer));
  } catch (err) {
    console.error("DOCX error:", err);
    res.status(500).json({ error: "DOCX generation failed: " + err.message });
  }
}

// ============================================
// TEMPLATE & THEME CONFIG
// ============================================

const COLORS = {
  black:  { primary: "000000", accent: "333333", light: "F5F5F5", line: "000000" },
  blue:   { primary: "1A56DB", accent: "1E40AF", light: "EFF6FF", line: "1A56DB" },
  green:  { primary: "15803D", accent: "166534", light: "F0FDF4", line: "15803D" },
  purple: { primary: "7C3AED", accent: "6D28D9", light: "F5F3FF", line: "7C3AED" },
  red:    { primary: "DC2626", accent: "B91C1C", light: "FEF2F2", line: "DC2626" },
  teal:   { primary: "0D9488", accent: "0F766E", light: "F0FDFA", line: "0D9488" }
};

const FONTS = {
  calibri: "Calibri", inter: "Arial", aptos: "Aptos", lato: "Arial",
  roboto: "Arial", arial: "Arial", helvetica: "Helvetica", garamond: "Garamond"
};

const MARGINS = {
  small:  { top: 0.4, bottom: 0.35, left: 0.5, right: 0.5 },
  medium: { top: 0.6, bottom: 0.5, left: 0.65, right: 0.65 },
  large:  { top: 0.8, bottom: 0.7, left: 0.85, right: 0.85 }
};

// Template styles — each defines font sizes, spacing, header style
const TEMPLATES = {
  "0": "harvard",   "1": "stanford",  "2": "google",
  "3": "ats",       "4": "executive", "5": "minimal",
  "6": "corporate", "7": "mit",       "8": "compact",  "9": "elegant",
  harvard: "harvard", stanford: "stanford", google: "google",
  ats: "ats", executive: "executive", minimal: "minimal",
  corporate: "corporate", mit: "mit", compact: "compact", elegant: "elegant"
};

function getTemplateStyle(templateId) {
  const tid = TEMPLATES[templateId] || TEMPLATES[templateId?.toString()] || "harvard";
  const styles = {
    harvard:   { nameSize: 40, titleSize: 22, headerSize: 21, bodySize: 19, bulletSize: 19, skillSize: 18, headerBorder: true, nameAlign: "center", nameWeight: true, sectionSpaceBefore: 200, bulletIndent: 0.25 },
    stanford:  { nameSize: 36, titleSize: 20, headerSize: 20, bodySize: 18, bulletSize: 18, skillSize: 17, headerBorder: true, nameAlign: "left", nameWeight: true, sectionSpaceBefore: 180, bulletIndent: 0.2 },
    google:    { nameSize: 38, titleSize: 21, headerSize: 20, bodySize: 19, bulletSize: 19, skillSize: 18, headerBorder: false, nameAlign: "left", nameWeight: true, sectionSpaceBefore: 160, bulletIndent: 0.25, headerUppercase: false, headerUnderline: true },
    ats:       { nameSize: 36, titleSize: 20, headerSize: 21, bodySize: 19, bulletSize: 19, skillSize: 18, headerBorder: true, nameAlign: "center", nameWeight: true, sectionSpaceBefore: 200, bulletIndent: 0.25 },
    executive: { nameSize: 44, titleSize: 24, headerSize: 22, bodySize: 20, bulletSize: 20, skillSize: 19, headerBorder: true, nameAlign: "center", nameWeight: true, sectionSpaceBefore: 240, bulletIndent: 0.3 },
    minimal:   { nameSize: 34, titleSize: 18, headerSize: 19, bodySize: 18, bulletSize: 18, skillSize: 17, headerBorder: false, nameAlign: "left", nameWeight: false, sectionSpaceBefore: 140, bulletIndent: 0.2, headerUppercase: true },
    corporate: { nameSize: 38, titleSize: 22, headerSize: 21, bodySize: 19, bulletSize: 19, skillSize: 18, headerBorder: true, nameAlign: "left", nameWeight: true, sectionSpaceBefore: 200, bulletIndent: 0.25, headerShading: true },
    mit:       { nameSize: 36, titleSize: 20, headerSize: 20, bodySize: 18, bulletSize: 18, skillSize: 17, headerBorder: true, nameAlign: "center", nameWeight: true, sectionSpaceBefore: 180, bulletIndent: 0.2 },
    compact:   { nameSize: 32, titleSize: 18, headerSize: 18, bodySize: 17, bulletSize: 17, skillSize: 16, headerBorder: true, nameAlign: "center", nameWeight: true, sectionSpaceBefore: 120, bulletIndent: 0.15, lineSpacing: 220 },
    elegant:   { nameSize: 42, titleSize: 22, headerSize: 21, bodySize: 19, bulletSize: 19, skillSize: 18, headerBorder: false, nameAlign: "center", nameWeight: false, sectionSpaceBefore: 220, bulletIndent: 0.25, headerUppercase: true, nameLetterSpacing: 200 }
  };
  return styles[tid] || styles.harvard;
}

// ============================================
// MAIN DOCUMENT BUILDER
// ============================================

function buildResumeDoc(rj, opts = {}) {
  const theme = COLORS[opts.color] || COLORS.black;
  const fontName = FONTS[opts.font] || "Calibri";
  const margins = MARGINS[opts.margin] || MARGINS.medium;
  const ts = getTemplateStyle(opts.template);
  const p = rj.personal || {};
  const sections = [];

  // ---- HELPER: Section header ----
  function sectionHeader(title) {
    const headerText = (ts.headerUppercase !== false) ? title.toUpperCase() : title;
    const children = [new TextRun({
      text: headerText,
      bold: true,
      size: ts.headerSize,
      font: fontName,
      color: theme.primary,
      underline: ts.headerUnderline ? { type: UnderlineType.SINGLE, color: theme.primary } : undefined
    })];

    const para = {
      spacing: { before: ts.sectionSpaceBefore, after: 60 },
      keepNext: true,
      children
    };

    if (ts.headerBorder) {
      para.border = { bottom: { style: BorderStyle.SINGLE, size: 4, color: theme.line } };
    }

    if (ts.headerShading) {
      para.shading = { type: ShadingType.CLEAR, fill: theme.light };
    }

    return new Paragraph(para);
  }

  // ---- HELPER: Bullet point ----
  function bulletPara(text) {
    return new Paragraph({
      spacing: { after: 30, line: ts.lineSpacing },
      indent: { left: convertInchesToTwip(ts.bulletIndent), hanging: convertInchesToTwip(0.15) },
      children: [new TextRun({
        text: "\u2022  " + text,
        size: ts.bulletSize,
        font: fontName
      })]
    });
  }

  // ---- HEADER ----
  const nameAlign = ts.nameAlign === "left" ? AlignmentType.LEFT : AlignmentType.CENTER;

  sections.push(new Paragraph({
    alignment: nameAlign,
    spacing: { after: 40 },
    children: [new TextRun({
      text: (p.fullName || "").toUpperCase(),
      bold: ts.nameWeight,
      size: ts.nameSize,
      font: fontName,
      color: theme.primary,
      characterSpacing: ts.nameLetterSpacing
    })]
  }));

  if (p.title) {
    sections.push(new Paragraph({
      alignment: nameAlign,
      spacing: { after: 40 },
      children: [new TextRun({ text: p.title, size: ts.titleSize, font: fontName, color: theme.accent })]
    }));
  }

  const contactParts = [p.email, p.phone, p.linkedin, p.github, p.portfolio, p.location].filter(Boolean);
  if (contactParts.length) {
    sections.push(new Paragraph({
      alignment: nameAlign,
      spacing: { after: 80 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: theme.line } },
      children: [new TextRun({ text: contactParts.join("  |  "), size: 17, font: fontName, color: "555555" })]
    }));
  }

  // ---- SUMMARY ----
  if (rj.summary) {
    sections.push(sectionHeader("Professional Summary"));
    sections.push(new Paragraph({
      spacing: { after: 60, line: ts.lineSpacing },
      children: [new TextRun({ text: rj.summary, size: ts.bodySize, font: fontName })]
    }));
  }

  // ---- KEY ACHIEVEMENTS ----
  if (rj.achievements && rj.achievements.length > 0) {
    sections.push(sectionHeader("Key Achievements"));
    rj.achievements.forEach(a => {
      const text = typeof a === "string" ? a : a.text;
      if (text) sections.push(bulletPara(text));
    });
  }

  // ---- TECHNICAL SKILLS ----
  if (rj.skills && rj.skills.length > 0) {
    sections.push(sectionHeader("Technical Skills"));
    rj.skills.forEach(cat => {
      if (cat.category && cat.items && cat.items.length) {
        sections.push(new Paragraph({
          spacing: { after: 30 },
          children: [
            new TextRun({ text: cat.category + ": ", bold: true, size: ts.skillSize, font: fontName, color: theme.accent }),
            new TextRun({ text: (cat.items || []).join(", "), size: ts.skillSize, font: fontName })
          ]
        }));
      }
    });
  }

  // ---- EXPERIENCE ----
  if (rj.experience && rj.experience.length > 0) {
    sections.push(sectionHeader("Professional Experience"));
    rj.experience.forEach(exp => {
      const titleRuns = [new TextRun({
        text: (exp.title || "").toUpperCase(),
        bold: true, size: ts.bodySize + 1, font: fontName, color: theme.primary
      })];
      const dateStr = [exp.startDate, exp.endDate].filter(Boolean).join(" \u2014 ");
      if (dateStr) {
        titleRuns.push(new TextRun({ text: "\t" + dateStr, size: ts.skillSize, font: fontName, color: "555555", italics: true }));
      }
      sections.push(new Paragraph({
        spacing: { before: 120, after: 20 },
        tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
        keepNext: true,
        children: titleRuns
      }));

      const companyParts = [exp.company, exp.location].filter(Boolean).join(", ");
      if (companyParts) {
        sections.push(new Paragraph({
          spacing: { after: 40 }, keepNext: true,
          children: [new TextRun({ text: companyParts, size: ts.skillSize, font: fontName, color: "555555", italics: true })]
        }));
      }

      if (exp.bullets && exp.bullets.length) {
        exp.bullets.forEach(b => {
          const text = typeof b === "string" ? b : b.text;
          if (text) sections.push(bulletPara(text));
        });
      }
    });
  }

  // ---- EDUCATION ----
  if (rj.education && rj.education.length > 0) {
    sections.push(sectionHeader("Education"));
    rj.education.forEach(edu => {
      const parts = [];
      if (edu.degree) parts.push(new TextRun({ text: edu.degree, bold: true, size: ts.bodySize, font: fontName }));
      if (edu.institution) parts.push(new TextRun({ text: " \u2014 " + edu.institution, size: ts.bodySize, font: fontName }));
      if (edu.year) parts.push(new TextRun({ text: " (" + edu.year + ")", size: ts.bodySize, font: fontName }));
      if (parts.length) sections.push(new Paragraph({ spacing: { after: 40 }, children: parts }));
    });
  }

  // ---- CERTIFICATIONS ----
  if (rj.certifications && rj.certifications.length > 0) {
    const validCerts = rj.certifications.filter(c => c.name && c.name.trim());
    if (validCerts.length) {
      sections.push(sectionHeader("Certifications"));
      validCerts.forEach(cert => {
        let line = cert.name;
        if (cert.issuer) line += " \u2014 " + cert.issuer;
        if (cert.year) line += " (" + cert.year + ")";
        if (cert.status === "target") line += " [Target]";
        if (cert.status === "in-progress") line += " [In Progress]";
        sections.push(new Paragraph({ spacing: { after: 30 }, children: [new TextRun({ text: line, size: ts.bodySize, font: fontName })] }));
      });
    }
  }

  // ---- PROJECTS ----
  if (rj.projects && rj.projects.length > 0) {
    sections.push(sectionHeader("Projects"));
    rj.projects.forEach(proj => {
      sections.push(new Paragraph({ spacing: { before: 80, after: 20 }, keepNext: true, children: [new TextRun({ text: proj.name || "", bold: true, size: ts.bodySize + 1, font: fontName, color: theme.primary })] }));
      if (proj.technologies?.length) sections.push(new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: "Technologies: " + proj.technologies.join(", "), italics: true, size: ts.skillSize, font: fontName })] }));
      if (proj.description) sections.push(new Paragraph({ spacing: { after: 30 }, children: [new TextRun({ text: proj.description, size: ts.bodySize, font: fontName })] }));
      if (proj.bullets) proj.bullets.forEach(b => { const t = typeof b === "string" ? b : (b.text || ""); if (t.trim()) sections.push(bulletPara(t)); });
    });
  }

  // ---- STRENGTHS ----
  if (rj.strengths && rj.strengths.length > 0) {
    const validStr = rj.strengths.filter(s => s && s.trim());
    if (validStr.length) {
      sections.push(sectionHeader("Professional Strengths"));
      sections.push(new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: validStr.join("  |  "), size: ts.bodySize, font: fontName })] }));
    }
  }

  return new Document({
    styles: { default: { document: { run: { font: fontName, size: ts.bodySize } } } },
    sections: [{
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: {
            top: convertInchesToTwip(margins.top),
            bottom: convertInchesToTwip(margins.bottom),
            left: convertInchesToTwip(margins.left),
            right: convertInchesToTwip(margins.right)
          }
        }
      },
      children: sections
    }]
  });
}

export const config = { maxDuration: 15 };
