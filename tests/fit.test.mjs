// Page-fitting maths for the resume builder.
// Run: node tests/fit.test.mjs
//
// The builder used to advertise "2-3 Pages" and measure nothing. These cover
// the two ways an auto-fit goes wrong: shrinking past readability to force a
// fit, and reporting a fit that is actually one line over.
import {
  MM_TO_PX, MIN_ZOOM, MAX_ZOOM, printableBox, pagesFor,
  zoomToFit, targetPagesFor, overflowAdvice,
  fillFor, nextScales, fitScore,
  MIN_FONT_SCALE, MAX_FONT_SCALE, MIN_LEAD_SCALE, MAX_LEAD_SCALE, MIN_LAST_PAGE
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

console.log('\ncontinuous fill (what an integer page count cannot express)');
near('one full page is 1.0', fillFor(H, H), 1, 0.001);
near('a page and a fifth is 1.2', fillFor(H * 1.2, H), 1.2, 0.001);
// The distinction the old integer-only code could not make.
check('2.05 and 2.9 pages are different numbers',
  fillFor(H * 2.05, H) !== fillFor(H * 2.9, H), true);
check('no content is no fill', fillFor(0, H), 0);

console.log('\ntwo-knob scaling');
// Over-long: leading is spent before type is touched.
const long1 = nextScales({ fill: 2.4, pages: 3, target: 2, font: 1, lead: 1 });
check('an over-long resume tightens the leading', long1.lead < 1, true);
check('and does not enlarge the type', long1.font <= 1, true);
check('leading never passes its floor', long1.lead >= MIN_LEAD_SCALE, true);
check('type never passes its floor', long1.font >= MIN_FONT_SCALE, true);

// Under-full: air, not bigger letters.
const short1 = nextScales({ fill: 1.2, pages: 2, target: 2, font: 1, lead: 1 });
check('an under-full resume opens the leading', short1.lead > 1, true);
check('leading never passes its ceiling', short1.lead <= MAX_LEAD_SCALE, true);
check('type never passes its ceiling', short1.font <= MAX_FONT_SCALE, true);
check('leading moves further than type when filling',
  (short1.lead - 1) > (short1.font - 1), true);

// A resume already sitting well is left alone.
const fine = nextScales({ fill: 1.9, pages: 2, target: 2, font: 1, lead: 1 });
check('a good fit is reported done', fine.done, true);
check('a good fit is not rescaled', fine.font === 1 && fine.lead === 1, true);

// A page that is technically within budget but nearly empty is NOT done --
// this is the branch the old code lacked entirely.
const empty2nd = nextScales({ fill: 1.1, pages: 2, target: 2, font: 1, lead: 1 });
check('a nearly empty last page is not accepted', empty2nd.done, false);
check('and it is treated as too short, not too long', empty2nd.tooShort, true);

// Passes must compound: feeding a scaled layout back in keeps moving.
const step1 = nextScales({ fill: 2.4, pages: 3, target: 2, font: 1, lead: 1 });
const step2 = nextScales({ fill: 2.1, pages: 3, target: 2, font: step1.font, lead: step1.lead });
check('a second pass tightens further, it does not reset',
  step2.lead <= step1.lead, true);

check('nonsense fill is refused', nextScales({ fill: 0, pages: 1, target: 2 }).done, true);

console.log('\nranking imperfect fits');
check('spilling a page loses to an under-filled one',
  fitScore({ pages: 3, target: 2, lastPage: 0.9 }) < fitScore({ pages: 2, target: 2, lastPage: 0.3 }), true);
check('the fuller of two clean fits wins',
  fitScore({ pages: 2, target: 2, lastPage: 0.95 }) > fitScore({ pages: 2, target: 2, lastPage: 0.4 }), true);
check('spilling two pages loses to spilling one',
  fitScore({ pages: 4, target: 2, lastPage: 0.9 }) < fitScore({ pages: 3, target: 2, lastPage: 0.1 }), true);

console.log('\nthe last-page threshold is a real constraint');
check('a 72%-full last page is acceptable', MIN_LAST_PAGE <= 0.72, true);
check('a 20%-full second page is rejected',
  nextScales({ fill: 1.2, pages: 2, target: 2 }).done, false);

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
