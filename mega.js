/*!
 * ZapKitt — small global stylesheet, injected on every page.
 * <script src="/mega.js" defer></script>
 *
 * This file used to build TinyWow-style per-category nav dropdowns (Resume,
 * Writing, PDF, Image, Audio & Video, Developer) on all 70 pages. Those are
 * gone, deliberately.
 *
 * Why: ZapKitt is now a career platform for international students, not a
 * general tool directory. Six category dropdowns sitting in front of the
 * career links made every page read as a tool directory again, pushed the nav
 * to twelve items, and listed "Resume" twice -- once as a dropdown, once as a
 * link. One nav, one identity, every page. The tool catalogue is still one
 * click away behind "All tools".
 *
 * The rule below is kept because it is load-bearing: it hides the AI model
 * attribution labels site-wide, and most pages have no other shared
 * stylesheet to put it in. Deleting this script outright would make those
 * badges reappear on every tool page.
 *
 * The old dropdown implementation is in git history if it is ever wanted back.
 */
(function () {
  "use strict";
  if (window.__zkGlobalCss) return;
  window.__zkGlobalCss = true;

  var css = '.model-badge,.model-info{display:none!important}';

  var el = document.createElement("style");
  el.id = "zk-global-css";
  el.textContent = css;
  (document.head || document.documentElement).appendChild(el);
})();
