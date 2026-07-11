/*!
 * ZapKitt Back button — a consistent "← Back" placed BELOW the header, left-aligned,
 * just above the page content (not inside the nav). Same on every tool.
 * Same-site history → goes back; direct/external landing → falls back to /all-tools.
 * Zero-config: <script src="/zapkitt-back.js"></script>
 */
(function () {
  "use strict";
  if (window.__zkBack) return;
  window.__zkBack = true;

  function make() {
    if (document.getElementById("zkBackBar")) return;

    var a = document.createElement("a");
    a.id = "zkBack";
    a.href = "/all-tools";
    a.textContent = "← Back";
    a.setAttribute("aria-label", "Go back");
    a.style.cssText = "display:inline-flex;align-items:center;gap:4px;color:#7c3aed;font:700 14px Inter,system-ui,sans-serif;text-decoration:none;cursor:pointer;transition:opacity .15s";
    a.onmouseover = function () { a.style.opacity = ".7"; };
    a.onmouseout = function () { a.style.opacity = "1"; };
    a.onclick = function (e) {
      e.preventDefault();
      if (document.referrer && document.referrer.indexOf(location.origin) === 0 && history.length > 1) history.back();
      else location.href = "/all-tools";
    };

    var bar = document.createElement("div");
    bar.id = "zkBackBar";
    bar.style.cssText = "max-width:1100px;margin:0 auto;padding:16px 24px 0;box-sizing:border-box;text-align:left";
    bar.appendChild(a);

    // Place directly below the header: after the top support banner if present, else after the nav.
    var anchor = document.getElementById("topSupport") || document.querySelector("nav.nav") || document.querySelector("nav") || document.querySelector(".nav-wrap");
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(bar, anchor.nextSibling);
    else document.body.insertBefore(bar, document.body.firstChild);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", make);
  else make();
})();
