// ============================================================================
// ZapKitt — fit a resume to a page budget.
//
// The builder advertised "2-3 Pages" and measured nothing, so a verbose
// history produced a four-page PDF and a thin one produced a half-empty page.
// Recruiters bin three-page resumes for anyone who is not an executive, and
// the Golden ATS rules put it plainly: one page under three years, two pages
// otherwise, never three.
//
// Fitting is done by scaling the whole document (CSS zoom, which reflows) and
// re-measuring, not by deleting the candidate's content. Two limits make that
// honest:
//
//   MIN_ZOOM  Below this, body text drops under ~7pt. ATS parsers cope, but
//             humans do not, and a resume nobody can read at a glance has
//             failed regardless of its page count. If the content will not fit
//             at MIN_ZOOM we STOP and tell the user what to cut. Silently
//             shrinking to 5pt, or silently truncating their last job, are
//             both worse than saying "this is too long".
//
//   MAX_ZOOM  Slightly above 1 so a short resume fills the page rather than
//             trailing off two-thirds down, which reads as thin.
// ============================================================================

// A4 at 96 CSS px per inch. 1mm = 96/25.4 px.
export const MM_TO_PX = 96 / 25.4;
export const A4 = { widthMm: 210, heightMm: 297 };

// Must match the margins passed to page.pdf() in api/pdf.js.
export const MARGINS_MM = { top: 12, right: 14, bottom: 10, left: 14 };

export const MIN_ZOOM = 0.80;
export const MAX_ZOOM = 1.06;

export function printableBox(margins = MARGINS_MM) {
  return {
    widthPx: (A4.widthMm - margins.left - margins.right) * MM_TO_PX,
    heightPx: (A4.heightMm - margins.top - margins.bottom) * MM_TO_PX
  };
}

// Sub-pixel slack, in PIXELS. Layout returns fractional heights, so a value a
// few hundredths of a pixel over the boundary is a rounding artefact. Anything
// a whole pixel over is a real line of text on a real extra page.
//
// Expressing this as a fraction of a page was wrong: 0.002 pages is ~2px on
// A4, which silently swallowed a genuine one-pixel overflow and reported a
// three-page resume as two.
const TOLERANCE_PX = 0.5;

// Chrome breaks a page as soon as content passes the boundary, so the page
// count is a ceiling, not a round.
export function pagesFor(contentHeightPx, pageHeightPx) {
  if (!(contentHeightPx > 0) || !(pageHeightPx > 0)) return 0;
  return Math.max(1, Math.ceil((contentHeightPx - TOLERANCE_PX) / pageHeightPx));
}

// The zoom that would exactly fill `targetPages`, clamped to what stays
// readable. Overshoot slightly (0.985) so a value landing precisely on the
// boundary does not tip onto a new page.
export function zoomToFit(contentHeightPx, pageHeightPx, targetPages, currentZoom = 1) {
  if (!(contentHeightPx > 0) || !(pageHeightPx > 0) || !(targetPages > 0)) return currentZoom;
  const available = pageHeightPx * targetPages;
  const ideal = currentZoom * (available / contentHeightPx) * 0.985;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(ideal.toFixed(4))));
}

// How many pages a resume of this seniority should be. Mirrors the Golden ATS
// rule, and caps at 2 -- three-page resumes are an executive-only exception
// this product does not serve.
export function targetPagesFor(yearsExperience) {
  const y = Number(yearsExperience);
  if (!isFinite(y) || y < 0) return 2;
  return y < 3 ? 1 : 2;
}

// What to say when the content genuinely will not fit. Specific, and never a
// silent truncation.
export function overflowAdvice(pages, targetPages) {
  const over = Math.max(0, pages - targetPages);
  return {
    fitted: over === 0,
    pages,
    targetPages,
    message: over === 0
      ? ''
      : 'This is ' + pages + ' pages at the smallest readable size; the target is ' +
        targetPages + '. Cut the oldest role to 3 bullets, drop any role over 10 years old ' +
        'to a single line, and remove skills the job description does not mention.'
  };
}
