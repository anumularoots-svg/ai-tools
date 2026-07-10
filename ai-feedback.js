/*!
 * ZapKitt AI Feedback Widget — reusable across all 110+ tools.
 * Usage:
 *   ZapKittFeedback.render(mountEl, {
 *     tool: 'email-writer',          // lens key (see api/feedback.js LENSES)
 *     toolLabel: 'AI Email Writer',  // human name shown in the analysis prompt
 *     input: userInputText,          // optional context
 *     output: generatedText,         // the output to analyze + copy/download
 *     feedback: {...},               // OPTIONAL precomputed feedback → skips /api/feedback
 *     onImprove: function(){...},    // OPTIONAL → shows "Improve Again" button
 *     fileName: 'result.txt'         // OPTIONAL download filename
 *   });
 * Precomputed `feedback` shape (for client-side tools like compressors):
 *   { overallScore, rating, confidence, strengths:[], issues:[], suggestions:[] }
 */
(function () {
  "use strict";
  if (window.ZapKittFeedback) return;

  var CSS = "" +
    ".zkf{margin-top:16px;border:1.5px solid #ede9fe;border-radius:16px;background:linear-gradient(180deg,#faf9ff,#fff);padding:20px;font-family:Inter,system-ui,sans-serif;color:#111}" +
    ".zkf-h{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:800;color:#7c3aed;text-transform:uppercase;letter-spacing:.5px;margin-bottom:14px}" +
    ".zkf-h svg{width:16px;height:16px}" +
    ".zkf-load{display:flex;align-items:center;gap:10px;color:#7c3aed;font-weight:600;font-size:14px;padding:6px 0}" +
    ".zkf-sp{width:16px;height:16px;border:2.5px solid #ede9fe;border-top-color:#7c3aed;border-radius:50%;animation:zkfspin .7s linear infinite}" +
    "@keyframes zkfspin{to{transform:rotate(360deg)}}" +
    ".zkf-top{display:flex;align-items:center;gap:18px;flex-wrap:wrap;margin-bottom:16px}" +
    ".zkf-ring{width:88px;height:88px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex:none}" +
    ".zkf-ring-in{width:70px;height:70px;border-radius:50%;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center}" +
    ".zkf-ring-in b{font-size:22px;font-weight:900;line-height:1}" +
    ".zkf-ring-in span{font-size:9px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px;margin-top:2px}" +
    ".zkf-meta{display:flex;flex-direction:column;gap:6px}" +
    ".zkf-stars{font-size:18px;letter-spacing:2px;line-height:1}" +
    ".zkf-conf{font-size:12px;color:#6b7280;font-weight:600}" +
    ".zkf-conf b{color:#111}" +
    ".zkf-cols{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px}" +
    "@media(max-width:560px){.zkf-cols{grid-template-columns:1fr}}" +
    ".zkf-sec h4{font-size:12px;font-weight:800;margin:0 0 8px;text-transform:uppercase;letter-spacing:.4px}" +
    ".zkf-sec.str h4{color:#059669}.zkf-sec.iss h4{color:#d97706}.zkf-sec.sug h4{color:#2563eb}" +
    ".zkf-li{display:flex;gap:7px;align-items:flex-start;font-size:13px;line-height:1.5;color:#374151;margin-bottom:6px}" +
    ".zkf-li i{font-style:normal;flex:none;font-weight:800}" +
    ".zkf-sec.str .zkf-li i{color:#10b981}.zkf-sec.iss .zkf-li i{color:#f59e0b}.zkf-sec.sug .zkf-li i{color:#3b82f6}" +
    ".zkf-btns{display:flex;gap:8px;flex-wrap:wrap}" +
    ".zkf-btn{display:inline-flex;align-items:center;gap:6px;padding:9px 16px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;border:1.5px solid transparent;font-family:inherit;transition:.15s}" +
    ".zkf-btn.p{background:linear-gradient(135deg,#7c3aed,#9333ea);color:#fff}.zkf-btn.p:hover{transform:translateY(-1px)}" +
    ".zkf-btn.g{background:#fff;color:#374151;border-color:#e5e7eb}.zkf-btn.g:hover{background:#f9fafb}" +
    ".zkf-err{color:#dc2626;font-size:13px;font-weight:600}";

  function injectCSS() {
    if (document.getElementById("zkf-css")) return;
    var s = document.createElement("style");
    s.id = "zkf-css";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function scoreColor(n) { return n >= 75 ? "#10b981" : n >= 50 ? "#f59e0b" : "#ef4444"; }
  function stars(r) { r = Math.max(0, Math.min(5, Math.round(r || 0))); return "★★★★★".slice(0, r) + "☆☆☆☆☆".slice(0, 5 - r); }

  function liList(items, sym) {
    if (!items || !items.length) return "";
    return items.map(function (x) { return '<div class="zkf-li"><i>' + sym + '</i><span>' + esc(x) + '</span></div>'; }).join("");
  }

  var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4L12 17l-6.3 4.4L8 14 2 9.4h7.6z"/></svg>';

  function renderCard(mount, fb, opts) {
    var sc = fb.overallScore;
    var col = scoreColor(sc);
    var ring = "conic-gradient(" + col + " " + (sc * 3.6) + "deg,#ede9fe 0deg)";
    var html = "" +
      '<div class="zkf-h">' + ICON + ' AI Analysis</div>' +
      '<div class="zkf-top">' +
        '<div class="zkf-ring" style="background:' + ring + '"><div class="zkf-ring-in"><b style="color:' + col + '">' + sc + '</b><span>/ 100</span></div></div>' +
        '<div class="zkf-meta">' +
          '<div class="zkf-stars" style="color:' + col + '">' + stars(fb.rating) + '</div>' +
          '<div class="zkf-conf">Confidence: <b>' + fb.confidence + '%</b></div>' +
          (fb.model ? '<div class="zkf-conf" style="color:#9ca3af">Analyzed by ' + esc(fb.model) + '</div>' : '') +
        '</div>' +
      '</div>' +
      '<div class="zkf-cols">' +
        (fb.strengths && fb.strengths.length ? '<div class="zkf-sec str"><h4>Strengths</h4>' + liList(fb.strengths, "✔") + '</div>' : '') +
        (fb.issues && fb.issues.length ? '<div class="zkf-sec iss"><h4>Needs Work</h4>' + liList(fb.issues, "!") + '</div>' : '') +
      '</div>' +
      (fb.suggestions && fb.suggestions.length ? '<div class="zkf-sec sug" style="margin-bottom:16px"><h4>Suggestions</h4>' + liList(fb.suggestions, "→") + '</div>' : '') +
      '<div class="zkf-btns">' +
        (opts.output ? '<button class="zkf-btn g" data-act="copy">Copy</button><button class="zkf-btn g" data-act="download">Download</button>' : '') +
        (typeof opts.onImprove === "function" ? '<button class="zkf-btn p" data-act="improve">✨ Improve Again</button>' : '') +
      '</div>';
    mount.innerHTML = html;

    var copyBtn = mount.querySelector('[data-act="copy"]');
    if (copyBtn) copyBtn.onclick = function () {
      navigator.clipboard.writeText(opts.output || "").then(function () {
        copyBtn.textContent = "✓ Copied"; setTimeout(function () { copyBtn.textContent = "Copy"; }, 1500);
      });
    };
    var dlBtn = mount.querySelector('[data-act="download"]');
    if (dlBtn) dlBtn.onclick = function () {
      var blob = new Blob([opts.output || ""], { type: "text/plain" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = opts.fileName || "zapkitt-output.txt";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    };
    var impBtn = mount.querySelector('[data-act="improve"]');
    if (impBtn) impBtn.onclick = function () { opts.onImprove(fb); };
  }

  function render(mount, opts) {
    if (typeof mount === "string") mount = document.getElementById(mount) || document.querySelector(mount);
    if (!mount) return;
    injectCSS();
    opts = opts || {};
    mount.className = (mount.className || "").indexOf("zkf") < 0 ? (mount.className + " zkf").trim() : mount.className;
    mount.style.display = "block";

    // Precomputed feedback (client-side tools) → render immediately, no API call.
    if (opts.feedback) { renderCard(mount, normalize(opts.feedback), opts); return; }

    mount.innerHTML = '<div class="zkf-load"><span class="zkf-sp"></span> Analyzing your result…</div>';
    fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool: opts.tool || "", toolLabel: opts.toolLabel || "", input: opts.input || "", output: opts.output || "" })
    }).then(function (r) { return r.json(); }).then(function (fb) {
      if (fb.error) { mount.innerHTML = '<div class="zkf-err">Feedback unavailable: ' + esc(fb.error) + '</div>'; return; }
      renderCard(mount, normalize(fb), opts);
    }).catch(function (e) {
      mount.innerHTML = '<div class="zkf-err">Feedback unavailable.</div>';
    });
  }

  function normalize(fb) {
    fb = fb || {};
    var sc = Math.max(0, Math.min(100, parseInt(fb.overallScore, 10) || 0));
    return {
      overallScore: sc,
      rating: Math.max(1, Math.min(5, parseInt(fb.rating, 10) || Math.round(sc / 20) || 1)),
      confidence: Math.max(0, Math.min(100, parseInt(fb.confidence, 10) || 90)),
      strengths: Array.isArray(fb.strengths) ? fb.strengths : [],
      issues: Array.isArray(fb.issues) ? fb.issues : [],
      suggestions: Array.isArray(fb.suggestions) ? fb.suggestions : [],
      model: fb.model || ""
    };
  }

  window.ZapKittFeedback = { render: render };
})();
