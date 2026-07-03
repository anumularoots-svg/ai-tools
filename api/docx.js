import {
  Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle,
  TabStopType, TabStopPosition, convertInchesToTwip, UnderlineType, ShadingType
} from "docx";

export default async function handler(req, res) {
  const origins = ["https://zapkitt.com", "https://www.zapkitt.com"];
  const o = req.headers.origin || "";
  res.setHeader("Access-Control-Allow-Origin", origins.includes(o) ? o : origins[0]);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { resumeJSON, fileName, template, color } = req.body;
  if (!resumeJSON) return res.status(400).json({ error: "resumeJSON required" });
  try {
    const tpl = resolveTemplate(template);
    const clr = resolveColor(color);
    const doc = buildDoc(resumeJSON, tpl, clr);
    const buffer = await Packer.toBuffer(doc);
    const name = fileName || (resumeJSON.personal?.fullName || "Resume").replace(/\s+/g, "_");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", "attachment; filename=\"" + name + ".docx\"");
    res.status(200).send(Buffer.from(buffer));
  } catch (err) { console.error("DOCX:", err); res.status(500).json({ error: err.message }); }
}

function resolveColor(c) {
  var colors = {
    black:  { h: "000000", a: "333333", l: "F0F0F0", ln: "000000" },
    blue:   { h: "1A56DB", a: "1E40AF", l: "EBF5FF", ln: "1A56DB" },
    green:  { h: "15803D", a: "166534", l: "ECFDF5", ln: "15803D" },
    purple: { h: "7C3AED", a: "6D28D9", l: "F3F0FF", ln: "7C3AED" },
    teal:   { h: "0D9488", a: "0F766E", l: "F0FDFA", ln: "0D9488" }
  };
  return colors[c] || colors.black;
}

function resolveTemplate(t) {
  var map = { "0":"harvard","1":"stanford","2":"google","3":"ats","4":"executive","5":"minimal","6":"corporate","7":"mit","8":"compact","9":"elegant","auto":"harvard" };
  var id = map[t] || map[String(t)] || "harvard";
  // Each template: genuinely different fonts, sizes, spacing, alignment, header style
  var T = {
    harvard:    { font:"Calibri",   nameS:40, titleS:22, headS:21, bodyS:19, skillS:18, bulletS:19, nameA:"center", headBorder:true,  headShade:false, headUL:false, nameB:true,  mTop:0.55, mBot:0.45, mLR:0.6,  spBefore:160, spBullet:25, bulletInd:0.22 },
    stanford:   { font:"Arial",     nameS:36, titleS:20, headS:20, bodyS:18, skillS:17, bulletS:18, nameA:"left",   headBorder:true,  headShade:false, headUL:false, nameB:true,  mTop:0.5,  mBot:0.4,  mLR:0.55, spBefore:140, spBullet:22, bulletInd:0.2  },
    google:     { font:"Arial",     nameS:38, titleS:21, headS:20, bodyS:19, skillS:18, bulletS:19, nameA:"left",   headBorder:false, headShade:false, headUL:true,  nameB:true,  mTop:0.5,  mBot:0.4,  mLR:0.6,  spBefore:140, spBullet:25, bulletInd:0.22 },
    ats:        { font:"Calibri",   nameS:36, titleS:20, headS:21, bodyS:19, skillS:18, bulletS:19, nameA:"center", headBorder:true,  headShade:false, headUL:false, nameB:true,  mTop:0.55, mBot:0.45, mLR:0.65, spBefore:160, spBullet:25, bulletInd:0.22 },
    executive:  { font:"Garamond",  nameS:46, titleS:26, headS:23, bodyS:20, skillS:19, bulletS:20, nameA:"center", headBorder:true,  headShade:false, headUL:false, nameB:true,  mTop:0.6,  mBot:0.5,  mLR:0.7,  spBefore:200, spBullet:30, bulletInd:0.28 },
    minimal:    { font:"Helvetica", nameS:32, titleS:18, headS:18, bodyS:17, skillS:16, bulletS:17, nameA:"left",   headBorder:false, headShade:false, headUL:false, nameB:false, mTop:0.4,  mBot:0.35, mLR:0.5,  spBefore:100, spBullet:18, bulletInd:0.18 },
    corporate:  { font:"Calibri",   nameS:38, titleS:22, headS:21, bodyS:19, skillS:18, bulletS:19, nameA:"left",   headBorder:false, headShade:true,  headUL:false, nameB:true,  mTop:0.55, mBot:0.45, mLR:0.6,  spBefore:160, spBullet:25, bulletInd:0.22 },
    mit:        { font:"Arial",     nameS:34, titleS:19, headS:19, bodyS:18, skillS:17, bulletS:18, nameA:"center", headBorder:true,  headShade:false, headUL:false, nameB:true,  mTop:0.45, mBot:0.4,  mLR:0.5,  spBefore:130, spBullet:20, bulletInd:0.18 },
    compact:    { font:"Arial",     nameS:30, titleS:17, headS:17, bodyS:16, skillS:15, bulletS:16, nameA:"center", headBorder:true,  headShade:false, headUL:false, nameB:true,  mTop:0.35, mBot:0.3,  mLR:0.45, spBefore:90,  spBullet:15, bulletInd:0.15 },
    elegant:    { font:"Garamond",  nameS:44, titleS:24, headS:22, bodyS:19, skillS:18, bulletS:19, nameA:"center", headBorder:false, headShade:false, headUL:true,  nameB:false, mTop:0.6,  mBot:0.5,  mLR:0.7,  spBefore:180, spBullet:25, bulletInd:0.25 }
  };
  return T[id] || T.harvard;
}

function buildDoc(rj, t, c) {
  var p = rj.personal || {};
  var sec = [];
  var al = t.nameA === "left" ? AlignmentType.LEFT : AlignmentType.CENTER;

  // NAME
  sec.push(new Paragraph({ alignment: al, spacing: { after: 30 }, children: [
    new TextRun({ text: (p.fullName || "").toUpperCase(), bold: t.nameB, size: t.nameS, font: t.font, color: c.h })
  ]}));
  // TITLE
  if (p.title) sec.push(new Paragraph({ alignment: al, spacing: { after: 30 }, children: [
    new TextRun({ text: p.title, size: t.titleS, font: t.font, color: c.a })
  ]}));
  // CONTACT
  var cp = [p.email, p.phone, p.linkedin, p.github, p.portfolio, p.location].filter(Boolean);
  if (cp.length) sec.push(new Paragraph({ alignment: al, spacing: { after: 60 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 5, color: c.ln } },
    children: [new TextRun({ text: cp.join("  |  "), size: 16, font: t.font, color: "666666" })]
  }));

  function sH(title) {
    var opts = { spacing: { before: t.spBefore, after: 50 }, keepNext: true, children: [
      new TextRun({ text: title.toUpperCase(), bold: true, size: t.headS, font: t.font, color: c.h,
        underline: t.headUL ? { type: UnderlineType.SINGLE, color: c.h } : undefined })
    ]};
    if (t.headBorder) opts.border = { bottom: { style: BorderStyle.SINGLE, size: 3, color: c.ln } };
    if (t.headShade) opts.shading = { type: ShadingType.CLEAR, fill: c.l };
    return new Paragraph(opts);
  }

  function bP(text) {
    return new Paragraph({ spacing: { after: t.spBullet },
      indent: { left: convertInchesToTwip(t.bulletInd), hanging: convertInchesToTwip(0.14) },
      children: [new TextRun({ text: "\u2022  " + text, size: t.bulletS, font: t.font })]
    });
  }

  // SUMMARY
  if (rj.summary) { sec.push(sH("Professional Summary")); sec.push(new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: rj.summary, size: t.bodyS, font: t.font })] })); }

  // ACHIEVEMENTS
  if (rj.achievements && rj.achievements.length) {
    var va = rj.achievements.filter(function(a) { var tx = typeof a === "string" ? a : a.text; return tx && tx.trim() && tx.trim().split(" ").length > 3; });
    if (va.length) { sec.push(sH("Key Achievements")); va.forEach(function(a) { sec.push(bP(typeof a === "string" ? a : a.text)); }); }
  }

  // SKILLS
  if (rj.skills && rj.skills.length) {
    var vs = rj.skills.filter(function(s) { return s.category && s.items && s.items.length; });
    if (vs.length) { sec.push(sH("Technical Skills")); vs.forEach(function(s) {
      sec.push(new Paragraph({ spacing: { after: 22 }, children: [
        new TextRun({ text: s.category + ": ", bold: true, size: t.skillS, font: t.font, color: c.a }),
        new TextRun({ text: s.items.join(", "), size: t.skillS, font: t.font })
      ]}));
    }); }
  }

  // EXPERIENCE
  if (rj.experience && rj.experience.length) {
    sec.push(sH("Professional Experience"));
    rj.experience.forEach(function(exp) {
      var tRuns = [new TextRun({ text: (exp.title || "").toUpperCase(), bold: true, size: t.bodyS + 1, font: t.font, color: c.h })];
      var ds = [exp.startDate, exp.endDate].filter(Boolean).join(" \u2014 ");
      if (ds) tRuns.push(new TextRun({ text: "\t" + ds, size: t.skillS, font: t.font, color: "555555", italics: true }));
      sec.push(new Paragraph({ spacing: { before: 90, after: 15 }, tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }], keepNext: true, children: tRuns }));
      var cmp = [exp.company, exp.location].filter(Boolean).join(", ");
      if (cmp) sec.push(new Paragraph({ spacing: { after: 30 }, keepNext: true, children: [new TextRun({ text: cmp, size: t.skillS, font: t.font, color: "555555", italics: true })] }));
      if (exp.bullets && exp.bullets.length) exp.bullets.forEach(function(b) { var tx = typeof b === "string" ? b : b.text; if (tx) sec.push(bP(tx)); });
    });
  }

  // EDUCATION
  if (rj.education && rj.education.length) {
    var ve = rj.education.filter(function(e) { return e.degree || e.institution; });
    if (ve.length) { sec.push(sH("Education")); ve.forEach(function(e) {
      var parts = [];
      if (e.degree) parts.push(new TextRun({ text: e.degree, bold: true, size: t.bodyS, font: t.font }));
      if (e.institution) parts.push(new TextRun({ text: " \u2014 " + e.institution, size: t.bodyS, font: t.font }));
      if (e.year) parts.push(new TextRun({ text: " (" + e.year + ")", size: t.bodyS, font: t.font }));
      sec.push(new Paragraph({ spacing: { after: 30 }, children: parts }));
    }); }
  }

  // CERTIFICATIONS
  if (rj.certifications && rj.certifications.length) {
    var vc = rj.certifications.filter(function(c) { return c.name && c.name.trim(); });
    if (vc.length) { sec.push(sH("Certifications")); vc.forEach(function(cert) {
      var ln = cert.name; if (cert.issuer) ln += " \u2014 " + cert.issuer; if (cert.year) ln += " (" + cert.year + ")";
      sec.push(new Paragraph({ spacing: { after: 22 }, children: [new TextRun({ text: ln, size: t.bodyS, font: t.font })] }));
    }); }
  }

  // PROJECTS
  if (rj.projects && rj.projects.length) {
    sec.push(sH("Projects"));
    rj.projects.forEach(function(proj) {
      sec.push(new Paragraph({ spacing: { before: 60, after: 15 }, keepNext: true, children: [new TextRun({ text: proj.name || "", bold: true, size: t.bodyS + 1, font: t.font, color: c.h })] }));
      if (proj.technologies && proj.technologies.length) sec.push(new Paragraph({ spacing: { after: 15 }, children: [new TextRun({ text: "Technologies: " + proj.technologies.join(", "), italics: true, size: t.skillS, font: t.font })] }));
      if (proj.bullets) proj.bullets.forEach(function(b) { var tx = typeof b === "string" ? b : (b.text || ""); if (tx.trim()) sec.push(bP(tx)); });
    });
  }

  // STRENGTHS
  if (rj.strengths && rj.strengths.length) {
    var vst = rj.strengths.filter(function(s) { return s && s.trim(); });
    if (vst.length) { sec.push(sH("Professional Strengths")); sec.push(new Paragraph({ spacing: { after: 30 }, children: [new TextRun({ text: vst.join("  |  "), size: t.bodyS, font: t.font })] })); }
  }

  return new Document({
    styles: { default: { document: { run: { font: t.font, size: t.bodyS } } } },
    sections: [{ properties: { page: { size: { width: 12240, height: 15840 },
      margin: { top: convertInchesToTwip(t.mTop), bottom: convertInchesToTwip(t.mBot), left: convertInchesToTwip(t.mLR), right: convertInchesToTwip(t.mLR) }
    }}, children: sec }]
  });
}

export const config = { maxDuration: 15 };
