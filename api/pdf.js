// ============================================
// ResumeGPT PDF API — Puppeteer/Chrome
// Input: Resume JSON or raw HTML
// Output: Professional A4 PDF
// ============================================

import chromium from "@sparticuz/chromium-min";
import puppeteer from "puppeteer-core";
import { renderResumeHTML, RESUME_CSS } from "../renderer/html-renderer.js";
import { printableBox, pagesFor, zoomToFit, targetPagesFor, overflowAdvice } from "../renderer/fit.js";

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

  const { resumeJSON, html, template, fileName } = req.body;

  if (!resumeJSON && !html) return res.status(400).json({ error: "resumeJSON or html required" });

  let browser = null;
  try {
    // Build HTML from JSON or use provided HTML
    let resumeHTML;
    if (resumeJSON) {
      resumeHTML = renderResumeHTML(resumeJSON, { template: template || "harvard" });
    } else {
      resumeHTML = html;
    }

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

    // ── Fit to the page budget ────────────────────────────────────────────
    // Measure in print media at the exact printable width, then scale the whole
    // document until it lands within budget. Measuring beats re-rendering: one
    // layout pass per attempt instead of one PDF per attempt, which matters
    // inside a 30s function.
    await page.emulateMediaType("print");
    const box = printableBox();
    const targetPages = Number(req.body.targetPages) || targetPagesFor(req.body.yearsExperience);

    async function measure(zoom) {
      return page.evaluate((z, widthPx) => {
        document.body.style.zoom = String(z);
        document.body.style.width = widthPx + "px";
        document.body.style.margin = "0";
        // Force layout before reading.
        void document.body.offsetHeight;
        return document.body.scrollHeight / z; // unscaled height, so zoom maths stays linear
      }, zoom, box.widthPx);
    }

    let zoom = 1;
    let unscaledHeight = await measure(1);
    let pages = pagesFor(unscaledHeight, box.heightPx);

    // Two passes is enough: the first jump is computed, not guessed, and the
    // second corrects for reflow (a shrink can pull a bullet up a line).
    for (let attempt = 0; attempt < 2 && pages !== targetPages; attempt++) {
      const next = zoomToFit(unscaledHeight, box.heightPx, targetPages, 1);
      if (Math.abs(next - zoom) < 0.005) break;
      zoom = next;
      const scaledHeight = await measure(zoom);
      pages = pagesFor(scaledHeight * zoom, box.heightPx);
      if (pages <= targetPages) break;
    }

    const fit = overflowAdvice(pages, targetPages);

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "12mm", right: "14mm", bottom: "10mm", left: "14mm" },
    });

    // Surfaced so the page can tell the user to trim rather than leaving them
    // to discover a third page in the download.
    res.setHeader("X-Resume-Pages", String(pages));
    res.setHeader("X-Resume-Target-Pages", String(targetPages));
    res.setHeader("X-Resume-Fitted", fit.fitted ? "1" : "0");
    res.setHeader("Access-Control-Expose-Headers",
      "X-Resume-Pages, X-Resume-Target-Pages, X-Resume-Fitted");

    const name = fileName || (resumeJSON?.personal?.fullName || "Resume").replace(/\s+/g, "_");
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
