// ============================================
// ZapKitt PDF Generation API — Puppeteer/Chromium
// Renders HTML resume to pixel-perfect A4 PDF
// ============================================

import chromium from "@sparticuz/chromium-min";
import puppeteer from "puppeteer-core";

// Chromium executable path for Vercel serverless
const CHROMIUM_URL =
  "https://github.com/nicholaschiasson/puppeteer-chromium-lambda-layer/releases/download/v133.0.0/chromium-v133.0.0-pack.tar";

export default async function handler(req, res) {
  // CORS
  const allowedOrigins = ["https://zapkitt.com", "https://www.zapkitt.com"];
  const origin = req.headers.origin || "";
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigins[0]);
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "POST only" });

  const { html, fileName } = req.body;
  if (!html) return res.status(400).json({ error: "HTML content required" });

  let browser = null;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(CHROMIUM_URL),
      headless: chromium.headless,
    });

    const page = await browser.newPage();

    // Build full HTML document with print CSS
    const fullHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
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
  .header { text-align: center; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1.5px solid #000; }
  .header .name { font-size: 20pt; font-weight: 900; letter-spacing: 1.5px; margin-bottom: 3px; }
  .header .title { font-size: 11pt; color: #444; margin-bottom: 4px; }
  .header .contact { font-size: 8.5pt; color: #666; }
  .section-header {
    font-size: 10.5pt; font-weight: bold; margin-top: 10px;
    padding-bottom: 2px; border-bottom: 1px solid #000; margin-bottom: 6px;
    break-after: avoid; page-break-after: avoid;
  }
  .section { break-inside: avoid-page; }
  .bullet {
    font-size: 9.5pt; margin-left: 4px; margin-bottom: 2.5px;
    text-indent: -12px; padding-left: 16px;
  }
  .job-header {
    display: flex; justify-content: space-between; align-items: baseline;
    margin-top: 8px; margin-bottom: 2px;
    break-after: avoid; page-break-after: avoid;
  }
  .job-title { font-size: 10pt; font-weight: bold; }
  .job-date { font-size: 9pt; color: #555; font-style: italic; }
  .company { font-size: 9pt; color: #555; font-style: italic; margin-bottom: 4px; }
  .text { font-size: 9.5pt; margin-bottom: 2px; }
  .skills-line { font-size: 9pt; margin-bottom: 2px; }
  .skills-cat { font-weight: bold; }
</style>
</head>
<body>
${html}
</body>
</html>`;

    await page.setContent(fullHtml, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: "15mm",
        right: "16mm",
        bottom: "14mm",
        left: "16mm",
      },
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${fileName || "resume"}.pdf"`
    );
    res.status(200).send(Buffer.from(pdfBuffer));
  } catch (err) {
    console.error("PDF generation error:", err);
    res.status(500).json({ error: "PDF generation failed: " + err.message });
  } finally {
    if (browser) await browser.close();
  }
}

export const config = {
  maxDuration: 30,
};
