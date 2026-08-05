// ============================================
// ResumeGPT PDF API — Puppeteer/Chrome
// Input: Resume JSON or raw HTML
// Output: Professional A4 PDF
// ============================================

import chromium from "@sparticuz/chromium-min";
import puppeteer from "puppeteer-core";
import { renderResumeHTML, RESUME_CSS } from "../renderer/html-renderer.js";
import {
  printableBox, pagesFor, fillFor, nextScales, fitScore,
  targetPagesFor, overflowAdvice, MIN_LAST_PAGE
} from "../renderer/fit.js";

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
      resumeHTML = renderResumeHTML(resumeJSON, { template: template || "Harvard_Classic", color: req.body.color, align: req.body.align });
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
    // Measure in print media at the exact printable width, then rescale via
    // two CSS custom properties and re-measure. Measuring beats re-rendering:
    // one layout pass per attempt instead of one PDF per attempt, which matters
    // inside a 30s function.
    //
    // The previous version drove this with `document.body.style.zoom`, which
    // was wrong twice: zoom scales the BOX as well as the type, so shrinking to
    // win a page also narrowed the content and left a dead gutter down the
    // right-hand side; and it then read `scrollHeight / z` back off the zoomed
    // element, double-counting the scale so the loop could not observe its own
    // effect. Neither problem exists with --fs / --ls.
    await page.emulateMediaType("print");
    const box = printableBox();
    const wanted = Number(req.body.targetPages) || targetPagesFor(req.body.yearsExperience);

    async function measure(font, lead) {
      return page.evaluate((f, l, widthPx) => {
        const root = document.documentElement;
        root.style.setProperty("--fs", String(f));
        root.style.setProperty("--ls", String(l));
        document.body.style.width = widthPx + "px";
        document.body.style.margin = "0";
        void document.body.offsetHeight;   // force layout before reading
        return document.body.scrollHeight; // true height at this scale
      }, font, lead, box.widthPx);
    }

    // Try each page count from one up to the target and keep the best. A single
    // fixed target cannot work: content of 1.2 pages can neither reach one page
    // at readable sizes nor fill two without being opened up, and the old code
    // called the resulting 80%-blank second page a success.
    let best = null;
    for (let P = 1; P <= wanted; P++) {
      let font = 1, lead = 1;
      let height = await measure(font, lead);
      let fill = fillFor(height, box.heightPx);
      let pages = pagesFor(height, box.heightPx);

      for (let i = 0; i < 4; i++) {
        const step = nextScales({ fill, pages, target: P, font, lead });
        if (step.done) break;
        const h = await measure(step.font, step.lead);
        const f = fillFor(h, box.heightPx);
        const pg = pagesFor(h, box.heightPx);
        if (step.tooShort && f > P) break;        // growing must not buy a page
        if (step.tooLong && f >= fill) break;     // shrinking must actually shrink
        font = step.font; lead = step.lead; height = h; fill = f; pages = pg;
      }

      const lastPage = fill - (pages - 1);
      const cand = { font, lead, pages, fill, lastPage, target: P,
                     ok: pages === P && lastPage >= MIN_LAST_PAGE };
      if (cand.ok) { best = cand; break; }
      if (!best || fitScore(cand) > fitScore(best)) best = cand;
    }

    // Re-apply the winning scales: later candidates left the DOM at their own.
    await measure(best.font, best.lead);

    const pages = best.pages;
    const targetPages = best.target;
    const fit = overflowAdvice(pages, targetPages);

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      // preferCSSPageSize makes Chrome take the size AND margins from the
      // @page rule in RESUME_CSS. Passing `margin` as well was dead config
      // that read as though it were in force -- it never was.
      preferCSSPageSize: true,
    });

    // Surfaced so the page can tell the user to trim, or to add content,
    // rather than leaving them to discover a third page -- or a blank half
    // page -- in the download.
    res.setHeader("X-Resume-Pages", String(pages));
    res.setHeader("X-Resume-Target-Pages", String(targetPages));
    res.setHeader("X-Resume-Fitted", fit.fitted ? "1" : "0");
    res.setHeader("X-Resume-Last-Page-Fill", best.lastPage.toFixed(3));
    res.setHeader("X-Resume-Font-Scale", best.font.toFixed(3));
    res.setHeader("X-Resume-Lead-Scale", best.lead.toFixed(3));
    res.setHeader("Access-Control-Expose-Headers",
      "X-Resume-Pages, X-Resume-Target-Pages, X-Resume-Fitted, " +
      "X-Resume-Last-Page-Fill, X-Resume-Font-Scale, X-Resume-Lead-Scale");

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
