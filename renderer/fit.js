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

// How many pages a resume of this seniority should be.
//
// US convention, which is stricter than the generic rule this used to follow:
// ONE page under ten years, two only beyond that, never three. The old
// threshold was three years, which sent a four-year candidate to two pages --
// in the US market that reads as padding and is a screen-out, not a bonus.
export function targetPagesFor(yearsExperience) {
  const y = Number(yearsExperience);
  if (!isFinite(y) || y < 0) return 1;
  return y < 10 ? 1 : 2;
}

// ============================================================================
// TWO-KNOB FITTING
//
// CSS `zoom` was the wrong instrument. It scales the box as well as the type,
// so shrinking a resume to win a page also narrowed it, leaving a dead gutter
// down the right-hand side -- the page got shorter AND emptier. And reading
// scrollHeight back out of a zoomed element double-counts the scale.
//
// So: two independent multipliers driven through CSS custom properties, no
// zoom anywhere. FONT scales the type; LEAD scales every vertical gap and
// line-height. Air between the lines is how a short resume fills a page
// honestly -- growing the type to reach page two looks like a school project
// -- which is why LEAD is allowed to travel much further than FONT.
// ============================================================================
export const MIN_FONT_SCALE = 0.85;
export const MAX_FONT_SCALE = 1.06;
export const MIN_LEAD_SCALE = 0.86;
export const MAX_LEAD_SCALE = 1.55;

// How full the final page must be before the fit counts as finished. Below
// this the page reads as abandoned rather than as a real second page.
export const MIN_LAST_PAGE = 0.72;

// Continuous page count. 1.83 means a page and most of another. `pagesFor`
// gives an integer, which cannot tell 2.05 pages from 2.9 -- and treating
// those two as the same input is what produced a 15% type cut for a 2%
// overflow.
export function fillFor(contentHeightPx, pageHeightPx) {
  if (!(contentHeightPx > 0) || !(pageHeightPx > 0)) return 0;
  return contentHeightPx / pageHeightPx;
}

// One step of the fit, as pure arithmetic. Returns the next (font, lead) pair
// to try, and whether there is any point trying.
//
// `fill` must be measured from the CURRENT layout, and the returned scales are
// absolute. Recomputing each pass from 1.0 is what made pass two undo pass one.
export function nextScales({ fill, pages, target, font = 1, lead = 1 }) {
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  if (!(fill > 0) || !(target > 0)) return { font, lead, done: true };

  const lastPage = fill - ((pages || Math.ceil(fill)) - 1);
  const tooLong = fill > target;
  const tooShort = (pages || Math.ceil(fill)) <= target && lastPage < MIN_LAST_PAGE;
  if (!tooLong && !tooShort) return { font, lead, done: true };

  // Where we want to land, as a multiple of what is on the page right now.
  const need = tooLong ? (target * 0.985) / fill : (target - 0.04) / fill;

  // Spend the leading budget first in both directions: tighter or airier lines
  // cost the reader far less than smaller or bigger letters.
  const nextLead = clamp(lead * need, MIN_LEAD_SCALE, MAX_LEAD_SCALE);
  const got = nextLead / lead;
  let nextFont = font;
  if (Math.abs(got - need) > 0.002) {
    nextFont = clamp(font * (need / got), MIN_FONT_SCALE, MAX_FONT_SCALE);
  }

  const done = Math.abs(nextLead - lead) < 0.004 && Math.abs(nextFont - font) < 0.004;
  return { font: nextFont, lead: nextLead, done, tooLong, tooShort };
}

// Rank two imperfect fits. Spilling past the target is far worse than a page
// that is merely under-filled, so it is penalised on a different scale.
export function fitScore({ pages, target, lastPage }) {
  const over = pages - target;
  return over > 0 ? (-100 * over) + lastPage : lastPage;
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
