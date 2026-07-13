/*!
 * ZapKitt Back bar — consistent "← Back" (dark) + "Home › {Page}" breadcrumb (blue),
 * placed BELOW the header on every tool page. Same on every page.
 * Same-site history → goes back; direct/external landing → falls back to /all-tools.
 * Zero-config: <script src="/zapkitt-back.js"></script>
 */
(function () {
  "use strict";
  if (window.__zkBack) return;
  window.__zkBack = true;

  function label() {
    var seg = location.pathname.replace(/^\/+|\/+$/g, "").replace(/\.html$/i, "").split("/").pop() || "";
    if (!seg) return "";
    var parts = seg.split("-").filter(function (w) { return w && w !== "tools" && w !== "t"; });
    var caps = { ai: "AI", pdf: "PDF", seo: "SEO", jpg: "JPG", png: "PNG", csv: "CSV", json: "JSON", html: "HTML", qr: "QR", upi: "UPI" };
    return parts.map(function (w) { return caps[w.toLowerCase()] || (w.charAt(0).toUpperCase() + w.slice(1)); }).join(" ");
  }

  function make() {
    if (document.getElementById("zkBackBar")) return;

    var back = document.createElement("a");
    back.id = "zkBack";
    back.href = "/all-tools";
    back.setAttribute("aria-label", "Go back");
    back.style.cssText = "display:inline-flex;align-items:center;gap:7px;color:#141A2E;font:700 14px Inter,system-ui,sans-serif;text-decoration:none;cursor:pointer;transition:color .15s,transform .15s";
    back.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>Back';
    back.onmouseover = function () { back.style.color = "#2F88FF"; back.style.transform = "translateX(-2px)"; };
    back.onmouseout = function () { back.style.color = "#141A2E"; back.style.transform = "none"; };
    back.onclick = function (e) {
      e.preventDefault();
      if (document.referrer && document.referrer.indexOf(location.origin) === 0 && history.length > 1) history.back();
      else location.href = "/all-tools";
    };

    var crumb = document.createElement("nav");
    crumb.setAttribute("aria-label", "Breadcrumb");
    crumb.style.cssText = "display:flex;align-items:center;gap:8px;font:600 13px Inter,system-ui,sans-serif";
    var lbl = label();
    crumb.innerHTML =
      '<a href="/" style="color:#2F88FF;text-decoration:none">Home</a>' +
      '<span style="color:#8A93A3">›</span>' +
      '<span style="color:#5B6472">' + (lbl || "Tool") + "</span>";

    var bar = document.createElement("div");
    bar.id = "zkBackBar";
    bar.style.cssText = "max-width:1160px;margin:0 auto;padding:18px 32px 0;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap";
    bar.appendChild(back);
    bar.appendChild(crumb);

    var anchor = document.getElementById("topSupport") || document.querySelector("nav.zk-nav") || document.querySelector("nav.nav") || document.querySelector("nav") || document.querySelector(".nav-wrap");
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(bar, anchor.nextSibling);
    else document.body.insertBefore(bar, document.body.firstChild);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", make);
  else make();
})();
