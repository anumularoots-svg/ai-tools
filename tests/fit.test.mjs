// Page-fitting maths for the resume builder.
// Run: node tests/fit.test.mjs
//
// The builder used to advertise "2-3 Pages" and measure nothing. These cover
// the two ways an auto-fit goes wrong: shrinking past readability to force a
// fit, and reporting a fit that is actually one line over.
import {
  MM_TO_PX, MIN_ZOOM, MAX_ZOOM, printableBox, pagesFor,
  zoomToFit, targetPagesFor, overflowAdvice
} from '../renderer/fit.js';

let pass = 0, fail = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         expected ' + JSON.stringify(expected) + '\n         actual   ' + JSON.stringify(actual)); }
}
function near(name, actual, expected, tol) {
  const ok = Math.abs(actual - expected) <= tol;
  if (ok) { pass++; console.log('  ok   ' + name + '  (' + actual + ')'); }
  else { fail++; console.log('  FAIL ' + name + '\n         expected ~' + expected + ' +/- ' + tol + '\n         actual   ' + actual); }
}

console.log('\nprintable area (A4 minus the margins api/pdf.js actually uses)');
const box = printableBox();
// 210 - 14 - 14 = 182mm wide; 297 - 12 - 10 = 275mm tall.
near('width is 182mm in px', box.widthPx, 182 * MM_TO_PX, 0.01);
near('height is 275mm in px', box.heightPx, 275 * MM_TO_PX, 0.01);

console.log('\npage counting');
const H = box.heightPx;
check('empty content is not a page', pagesFor(0, H), 0);
check('a sliver of content is one page', pagesFor(10, H), 1);
check('exactly one page is one page', pagesFor(H, H), 1);
// The case that matters: one line over must count as two, not round down.
check('one pixel over is two pages', pagesFor(H + 1, H), 2);
check('a page and a half is two', pagesFor(H * 1.5, H), 2);
check('exactly two pages is two', pagesFor(H * 2, H), 2);
check('a hair over two is three', pagesFor(H * 2 + 1, H), 3);
// Sub-pixel rounding from layout must not invent a page.
check('a rounding artefact does not add a page', pagesFor(H + 0.001, H), 1);
check('a bad page height is refused', pagesFor(500, 0), 0);

console.log('\nzoom to fit');
// Content of 2.4 pages asked to fit 2 should shrink to roughly 2/2.4.
near('a 2.4-page resume shrinks to about 0.82', zoomToFit(H * 2.4, H, 2), 0.82, 0.02);
check('shrinking never passes the readability floor',
  zoomToFit(H * 10, H, 2) >= MIN_ZOOM, true);
check('a wildly long resume lands exactly on the floor',
  zoomToFit(H * 10, H, 2), MIN_ZOOM);
check('growth is capped so short resumes are not blown up',
  zoomToFit(H * 0.2, H, 2) <= MAX_ZOOM, true);
check('a resume already fitting is not shrunk',
  zoomToFit(H * 1.9, H, 2) >= 1, true);
check('nonsense input returns the current zoom unchanged', zoomToFit(0, H, 2, 0.9), 0.9);

console.log('\nzoom actually achieves the fit');
// The real contract: after applying the zoom, does it fit?
for (const overflow of [2.1, 2.2, 2.35, 2.4]) {
  const h = H * overflow;
  const z = zoomToFit(h, H, 2);
  check('content of ' + overflow + ' pages fits 2 after zoom', pagesFor(h * z, H) <= 2, true);
}
// And the honest failure: past the floor it does NOT fit, and must say so.
const tooLong = H * 3.5;
const zFloor = zoomToFit(tooLong, H, 2);
check('a 3.5-page resume cannot be forced into 2', pagesFor(tooLong * zFloor, H) > 2, true);

console.log('\ntarget pages by seniority (Golden ATS rule)');
check('a fresher gets one page', targetPagesFor(0), 1);
check('2 years gets one page', targetPagesFor(2), 1);
check('3 years gets two pages', targetPagesFor(3), 2);
check('12 years still gets two pages, never three', targetPagesFor(12), 2);
check('30 years still gets two pages', targetPagesFor(30), 2);
check('unknown experience defaults to two', targetPagesFor(undefined), 2);
check('nonsense experience defaults to two', targetPagesFor('lots'), 2);

console.log('\noverflow advice');
const ok2 = overflowAdvice(2, 2);
check('a fit reports fitted', ok2.fitted, true);
check('a fit says nothing', ok2.message, '');
const over = overflowAdvice(3, 2);
check('an overflow reports not fitted', over.fitted, false);
check('the advice names what to cut', /oldest role/.test(over.message), true);
check('the advice states both numbers', /3 pages/.test(over.message) && /is 2/.test(over.message), true);

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
