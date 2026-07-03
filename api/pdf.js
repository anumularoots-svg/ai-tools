// ============================================
// ResumeGPT PDF API — Puppeteer/Chrome
// Input: Resume JSON
// Output: Professional A4 PDF
// ============================================

import chromium from "@sparticuz/chromium-min";
import puppeteer from "puppeteer-core";
import { renderResumeHTML, RESUME_CSS } from "../renderer/html-renderer.js";

const CHROMIUM_URL =
  "https://github.com/nicholaschiasson/puppeteer-chromium-lambda-layer/releases/download/v133.0.0/chromium-v133.0.0-pack.tar";

export default async function handler(req, res) {
  // CORS
  const allowedOrigins = ["https://zapkitt.com", "https://www.zapkitt.com"];
  const origin = req.headers.origin || "";
  res.setHeader("Access-Control-Allow-Origin", allowedOrigins.includes(origin) ? origin : allowedOrigins[0]);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { resumeJSON, template, fileName } = req.body;

  if (!resumeJSON) return res.status(400).json({ error: "resumeJSON required" });

  let browser = null;
  try {
    // Render JSON to HTML
    const resumeHTML = renderResumeHTML(resumeJSON, { template: template || "harvard" });

    // Build full document
    const fullHTML = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>${RESUME_CSS}</style></head>
<body>${resumeHTML}</body></html>`;

    // Launch Chrome
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(CHROMIUM_URL),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.setContent(fullHTML, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "15mm", right: "16mm", bottom: "14mm", left: "16mm" },
    });

    const name = fileName || (resumeJSON.personal?.fullName || "Resume").replace(/\s+/g, "_");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${name}_Resume.pdf"`);
    res.status(200).send(Buffer.from(pdfBuffer));
  } catch (err) {
    console.error("PDF error:", err);
    res.status(500).json({ error: "PDF generation failed: " + err.message });
  } finally {
    if (browser) await browser.close();
  }
}

export const config = { maxDuration: 30 };
