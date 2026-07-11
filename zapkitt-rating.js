/*!
 * ZapKitt Experience Rating Widget — reusable across all tools.
 * Compact "How was your experience?" strip that expands on rating and posts
 * to the existing Telegram feedback pipeline (/api/interview action:'feedback').
 *
 * Zero-config: just add on any tool page —
 *   <script src="/zapkitt-rating.js"></script>
 * Source is auto-derived from <title> (text before — or |). Override with:
 *   <script src="/zapkitt-rating.js" data-source="AI Cover Letter"></script>
 * Disable auto-mount (to place manually) with data-auto="off", then call:
 *   ZapKittRating.render(mountEl, { source: "AI Cover Letter" });
 */
(function () {
  "use strict";
  if (window.ZapKittRating) return;

  var CC = [
    ["IN", "+91"], ["US", "+1"], ["GB", "+44"], ["AE", "+971"], ["SA", "+966"], ["SG", "+65"],
    ["MY", "+60"], ["AU", "+61"], ["DE", "+49"], ["FR", "+33"], ["ES", "+34"], ["IT", "+39"],
    ["NL", "+31"], ["RU", "+7"], ["TR", "+90"], ["PL", "+48"], ["CN", "+86"], ["JP", "+81"],
    ["KR", "+82"], ["ID", "+62"], ["TH", "+66"], ["VN", "+84"], ["BD", "+880"], ["PK", "+92"],
    ["LK", "+94"], ["NP", "+977"], ["EG", "+20"], ["NG", "+234"], ["ZA", "+27"], ["BR", "+55"],
    ["MX", "+52"]
  ];

  var CSS = "" +
    ".zkr{margin:20px 0;border:1.5px solid #e5e7eb;border-radius:16px;background:#f9fafb;padding:18px 20px;font-family:Inter,system-ui,sans-serif;color:#111}" +
    ".zkr-t{text-align:center;font-size:15px;font-weight:700;color:#111;margin-bottom:12px}" +
    ".zkr-emos{display:flex;justify-content:center;gap:8px;flex-wrap:wrap}" +
    ".zkr-emo{width:52px;height:52px;border:1.5px solid #e5e7eb;border-radius:12px;background:#fff;font-size:24px;line-height:1;cursor:pointer;transition:.15s;display:flex;align-items:center;justify-content:center}" +
    ".zkr-emo:hover{transform:translateY(-2px);border-color:#c4b5fd}" +
    ".zkr-emo.on{border-color:#2563eb;background:#eff6ff}" +
    ".zkr-more{display:none;margin-top:14px}" +
    ".zkr-more.show{display:block}" +
    ".zkr-ta{width:100%;padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:8px;font-family:inherit;font-size:13px;min-height:56px;resize:vertical;outline:0;margin-bottom:8px;background:#fff}" +
    ".zkr-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px}" +
    "@media(max-width:520px){.zkr-row{grid-template-columns:1fr}}" +
    ".zkr-row input{padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:8px;font-family:inherit;font-size:13px;outline:0;background:#fff;width:100%}" +
    ".zkr-phone{display:flex;gap:4px}" +
    ".zkr-phone select{flex:0 0 auto;max-width:104px;padding:10px 4px;border:1.5px solid #e5e7eb;border-radius:8px;font-family:inherit;font-size:13px;outline:0;background:#fff;cursor:pointer}" +
    ".zkr-phone input{flex:1;min-width:0}" +
    ".zkr-note{font-size:10px;color:#9ca3af;text-align:center;margin-bottom:10px}" +
    ".zkr-sub{display:block;margin:0 auto;padding:10px 28px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit}" +
    ".zkr-sub:hover{background:#1d4ed8}.zkr-sub:disabled{opacity:.5;cursor:default}" +
    ".zkr-done{display:none;text-align:center;color:#16a34a;font-size:13px;font-weight:700;margin-top:10px}";

  function injectCSS() {
    if (document.getElementById("zkr-css")) return;
    var s = document.createElement("style");
    s.id = "zkr-css"; s.textContent = CSS;
    document.head.appendChild(s);
  }

  var EMOS = [["😞", "Poor"], ["😐", "OK"], ["🙂", "Good"], ["😊", "Great"], ["🤩", "Amazing"]];

  function render(mount, opts) {
    if (typeof mount === "string") mount = document.getElementById(mount) || document.querySelector(mount);
    if (!mount) return;
    opts = opts || {};
    var source = opts.source || "ZapKitt Tool";
    injectCSS();
    mount.className = (mount.className.indexOf("zkr") < 0 ? (mount.className + " zkr").trim() : mount.className);

    var ccOpts = CC.map(function (c) { return '<option value="' + c[1] + '">' + c[0] + " " + c[1] + "</option>"; }).join("");
    mount.innerHTML = "" +
      '<div class="zkr-t">How was your experience?</div>' +
      '<div class="zkr-emos">' +
        EMOS.map(function (e, i) { return '<button type="button" class="zkr-emo" data-r="' + (i + 1) + '" title="' + e[1] + '">' + e[0] + '</button>'; }).join("") +
      '</div>' +
      '<div class="zkr-more">' +
        '<textarea class="zkr-ta" placeholder="Any suggestions to improve? (optional)"></textarea>' +
        '<div class="zkr-row">' +
          '<input class="zkr-name" type="text" placeholder="Your Name (optional)">' +
          '<div class="zkr-phone"><select class="zkr-cc" title="Country code">' + ccOpts + '</select>' +
          '<input class="zkr-num" type="tel" placeholder="WhatsApp Number (optional)"></div>' +
        '</div>' +
        '<div class="zkr-note">Name &amp; number only for follow-up — never shared or stored permanently.</div>' +
        '<button type="button" class="zkr-sub">Submit Feedback</button>' +
      '</div>' +
      '<div class="zkr-done">Thank you for your feedback!</div>';

    var rating = 0;
    var emos = mount.querySelectorAll(".zkr-emo");
    var more = mount.querySelector(".zkr-more");
    for (var i = 0; i < emos.length; i++) {
      (function (btn) {
        btn.onclick = function () {
          rating = parseInt(btn.getAttribute("data-r"), 10);
          for (var k = 0; k < emos.length; k++) emos[k].classList.toggle("on", k < rating);
          more.classList.add("show");
        };
      })(emos[i]);
    }

    mount.querySelector(".zkr-sub").onclick = function () {
      var btn = this;
      var text = mount.querySelector(".zkr-ta").value.trim();
      var name = mount.querySelector(".zkr-name").value.trim();
      var cc = mount.querySelector(".zkr-cc").value;
      var num = mount.querySelector(".zkr-num").value.trim().replace(/^0+/, "");
      var phone = num ? (cc + " " + num) : "";
      btn.disabled = true;
      fetch("/api/interview", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "feedback", source: source, rating: rating, text: text, name: name, phone: phone })
      }).catch(function () {});
      more.classList.remove("show");
      mount.querySelector(".zkr-done").style.display = "block";
    };
  }

  // Auto-derive a friendly source name from the page title.
  function sourceFromTitle() {
    var t = (document.title || "").split(/[—\-|]/)[0].trim();
    return t || "ZapKitt Tool";
  }

  function autoMount(source) {
    if (document.getElementById("zkrAuto")) return;
    var mount = document.createElement("div");
    mount.id = "zkrAuto";
    var host = document.querySelector(".seo, #seoSection, .related, footer, .foot");
    if (host && host.parentNode) host.parentNode.insertBefore(mount, host);
    else document.body.appendChild(mount);
    render(mount, { source: source || sourceFromTitle() });
  }

  window.ZapKittRating = { render: render, autoMount: autoMount };

  // Zero-config auto-mount unless disabled.
  var cs = document.currentScript;
  var auto = !cs || cs.getAttribute("data-auto") !== "off";
  var src = cs ? cs.getAttribute("data-source") : "";
  if (auto) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { autoMount(src); });
    else autoMount(src);
  }
})();
