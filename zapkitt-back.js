/*!
 * ZapKitt Back button — injects a consistent "← Back" link into the nav of every tool.
 * Same-site history → goes back; direct/external landing → falls back to /all-tools.
 * Zero-config: <script src="/zapkitt-back.js"></script>
 */
(function () {
  "use strict";
  if (window.__zkBack) return;
  window.__zkBack = true;

  function make() {
    if (document.getElementById("zkBack")) return;
    var a = document.createElement("a");
    a.id = "zkBack";
    a.href = "/all-tools";
    a.textContent = "← Back";
    a.setAttribute("aria-label", "Go back");
    a.onclick = function (e) {
      e.preventDefault();
      if (document.referrer && document.referrer.indexOf(location.origin) === 0 && history.length > 1) history.back();
      else location.href = "/all-tools";
    };

    // Preferred: sit as the first item inside the nav-links group (matches existing links).
    var links = document.querySelector(".nav-links, .nl");
    if (links) {
      a.style.cssText = "color:#7c3aed;font-weight:700";
      links.insertBefore(a, links.firstChild);
      return;
    }
    // Next: after the logo inside the nav row.
    var navIn = document.querySelector(".nav-in");
    if (navIn) {
      a.style.cssText = "color:#7c3aed;font-weight:700;font-size:13px;margin-right:auto;padding-left:14px";
      var logo = navIn.querySelector(".logo");
      if (logo && logo.nextSibling) navIn.insertBefore(a, logo.nextSibling);
      else navIn.appendChild(a);
      return;
    }
    // Fallback: fixed top-left pill for pages without a standard nav.
    a.style.cssText = "position:fixed;top:12px;left:12px;z-index:200;background:#fff;border:1.5px solid #e5e7eb;border-radius:20px;padding:7px 14px;font:600 13px Inter,system-ui,sans-serif;color:#7c3aed;box-shadow:0 2px 10px rgba(0,0,0,.06)";
    document.body.appendChild(a);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", make);
  else make();
})();
