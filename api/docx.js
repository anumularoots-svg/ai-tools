// ============================================
// ZapKitt DOCX Resume API
// Input: Resume JSON → Output: Professional DOCX
// Uses docx (npm) for pixel-perfect Word documents
// ============================================

import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, BorderStyle, TabStopType, TabStopPosition,
  convertInchesToTwip, ShadingType, UnderlineType, PageBreak
} from "docx";

export default async function handler(req, res) {
  const origins = ["https://zapkitt.com", "https://www.zapkitt.com"];
  const o = req.headers.origin || "";
  res.setHeader("Access-Control-Allow-Origin", origins.includes(o) ? o : origins[0]);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { resumeJSON, fileName } = req.body;
  if (!resumeJSON) return res.status(400).json({ error: "resumeJSON required" });

  try {
    const doc = buildResumeDoc(resumeJSON);
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

function buildResumeDoc(rj) {
  const p = rj.personal || {};
  const sections = [];

  // ---- HEADER ----
  const headerParas = [];

  // Name
  headerParas.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 40 },
    children: [new TextRun({
      text: (p.fullName || "").toUpperCase(),
      bold: true,
      size: 40, // 20pt
      font: "Calibri",
      color: "000000"
    })]
  }));

  // Title
  if (p.title) {
    headerParas.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [new TextRun({
        text: p.title,
        size: 22, // 11pt
        font: "Calibri",
        color: "444444"
      })]
    }));
  }

  // Contact line
  const contactParts = [p.email, p.phone, p.linkedin, p.github, p.portfolio, p.location].filter(Boolean);
  if (contactParts.length) {
    headerParas.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000" } },
      children: [new TextRun({
        text: contactParts.join("  |  "),
        size: 17, // 8.5pt
        font: "Calibri",
        color: "555555"
      })]
    }));
  }

  sections.push(...headerParas);

  // ---- HELPER: Section header ----
  function sectionHeader(title) {
    return new Paragraph({
      spacing: { before: 200, after: 60 },
      keepNext: true,
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "000000" } },
      children: [new TextRun({
        text: title.toUpperCase(),
        bold: true,
        size: 21, // 10.5pt
        font: "Calibri",
        color: "000000"
      })]
    });
  }

  // ---- HELPER: Bullet point ----
  function bulletPara(text) {
    return new Paragraph({
      spacing: { after: 30 },
      indent: { left: convertInchesToTwip(0.25), hanging: convertInchesToTwip(0.15) },
      children: [new TextRun({
        text: "\u2022  " + text,
        size: 19, // 9.5pt
        font: "Calibri"
      })]
    });
  }

  // ---- SUMMARY ----
  if (rj.summary) {
    sections.push(sectionHeader("Professional Summary"));
    sections.push(new Paragraph({
      spacing: { after: 60 },
      children: [new TextRun({
        text: rj.summary,
        size: 19,
        font: "Calibri"
      })]
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
            new TextRun({ text: cat.category + ": ", bold: true, size: 18, font: "Calibri" }),
            new TextRun({ text: (cat.items || []).join(", "), size: 18, font: "Calibri" })
          ]
        }));
      }
    });
  }

  // ---- EXPERIENCE ----
  if (rj.experience && rj.experience.length > 0) {
    sections.push(sectionHeader("Professional Experience"));
    rj.experience.forEach(exp => {
      // Job title + dates on same line
      const titleRuns = [
        new TextRun({
          text: (exp.title || "").toUpperCase(),
          bold: true,
          size: 20, // 10pt
          font: "Calibri"
        })
      ];

      const dateStr = [exp.startDate, exp.endDate].filter(Boolean).join(" \u2014 ");
      if (dateStr) {
        titleRuns.push(new TextRun({
          text: "\t" + dateStr,
          size: 18,
          font: "Calibri",
          color: "555555",
          italics: true
        }));
      }

      sections.push(new Paragraph({
        spacing: { before: 120, after: 20 },
        tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
        keepNext: true,
        children: titleRuns
      }));

      // Company + location
      const companyParts = [exp.company, exp.location].filter(Boolean).join(", ");
      if (companyParts) {
        sections.push(new Paragraph({
          spacing: { after: 40 },
          keepNext: true,
          children: [new TextRun({
            text: companyParts,
            size: 18,
            font: "Calibri",
            color: "555555",
            italics: true
          })]
        }));
      }

      // Bullets
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
      if (edu.degree) parts.push(new TextRun({ text: edu.degree, bold: true, size: 19, font: "Calibri" }));
      if (edu.institution) parts.push(new TextRun({ text: " \u2014 " + edu.institution, size: 19, font: "Calibri" }));
      if (edu.year) parts.push(new TextRun({ text: " (" + edu.year + ")", size: 19, font: "Calibri" }));
      if (parts.length) {
        sections.push(new Paragraph({ spacing: { after: 40 }, children: parts }));
      }
      if (edu.gpa) {
        sections.push(new Paragraph({
          spacing: { after: 30 },
          children: [new TextRun({ text: "GPA: " + edu.gpa, size: 19, font: "Calibri" })]
        }));
      }
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
        sections.push(new Paragraph({
          spacing: { after: 30 },
          children: [new TextRun({ text: line, size: 19, font: "Calibri" })]
        }));
      });
    }
  }

  // ---- PROJECTS ----
  if (rj.projects && rj.projects.length > 0) {
    sections.push(sectionHeader("Projects"));
    rj.projects.forEach(proj => {
      sections.push(new Paragraph({
        spacing: { before: 80, after: 20 },
        children: [new TextRun({ text: proj.name || "", bold: true, size: 20, font: "Calibri" })]
      }));
      if (proj.technologies && proj.technologies.length) {
        sections.push(new Paragraph({
          spacing: { after: 20 },
          children: [new TextRun({ text: "Technologies: " + proj.technologies.join(", "), italics: true, size: 18, font: "Calibri" })]
        }));
      }
      if (proj.description) {
        sections.push(new Paragraph({
          spacing: { after: 30 },
          children: [new TextRun({ text: proj.description, size: 19, font: "Calibri" })]
        }));
      }
      if (proj.bullets) {
        proj.bullets.forEach(b => { if (b) sections.push(bulletPara(typeof b === "string" ? b : b.text || "")); });
      }
    });
  }

  // ---- STRENGTHS ----
  if (rj.strengths && rj.strengths.length > 0) {
    const validStr = rj.strengths.filter(s => s && s.trim());
    if (validStr.length) {
      sections.push(sectionHeader("Professional Strengths"));
      sections.push(new Paragraph({
        spacing: { after: 40 },
        children: [new TextRun({ text: validStr.join("  |  "), size: 19, font: "Calibri" })]
      }));
    }
  }

  return new Document({
    styles: {
      default: {
        document: {
          run: { font: "Calibri", size: 19 }
        }
      }
    },
    sections: [{
      properties: {
        page: {
          size: { width: 12240, height: 15840 }, // A4 in DXA
          margin: {
            top: convertInchesToTwip(0.6),
            bottom: convertInchesToTwip(0.5),
            left: convertInchesToTwip(0.65),
            right: convertInchesToTwip(0.65)
          }
        }
      },
      children: sections
    }]
  });
}

export const config = { maxDuration: 15 };
