/*!
 * ZapKitt Experience Rating Widget — reusable across all tools.
 * Compact "How was your experience?" strip that expands on rating and posts
 * to the existing Telegram feedback pipeline (/api/interview action:'feedback').
 * Name + Mobile are REQUIRED (real leads). Country picker shows flags and
 * validates the mobile length for the selected country.
 *
 * Zero-config: <script src="/zapkitt-rating.js"></script>
 * Source auto-derived from <title>. Override: data-source="AI Cover Letter".
 * Manual: ZapKittRating.render(el, { source: "AI Cover Letter" });
 */
(function () {
  "use strict";
  if (window.ZapKittRating) return;

  // flag, iso, dial, min/max local mobile digits (after country code).
  var CC = [
    ["🇮🇳", "IN", "+91", 10, 10], ["🇺🇸", "US", "+1", 10, 10], ["🇬🇧", "GB", "+44", 10, 10],
    ["🇦🇪", "AE", "+971", 9, 9], ["🇸🇦", "SA", "+966", 9, 9], ["🇸🇬", "SG", "+65", 8, 8],
    ["🇲🇾", "MY", "+60", 9, 10], ["🇦🇺", "AU", "+61", 9, 9], ["🇨🇦", "CA", "+1", 10, 10],
    ["🇩🇪", "DE", "+49", 10, 11], ["🇫🇷", "FR", "+33", 9, 9], ["🇪🇸", "ES", "+34", 9, 9],
    ["🇮🇹", "IT", "+39", 9, 10], ["🇳🇱", "NL", "+31", 9, 9], ["🇷🇺", "RU", "+7", 10, 10],
    ["🇹🇷", "TR", "+90", 10, 10], ["🇵🇰", "PK", "+92", 10, 10], ["🇧🇩", "BD", "+880", 10, 10],
    ["🇱🇰", "LK", "+94", 9, 9], ["🇳🇵", "NP", "+977", 10, 10], ["🇮🇩", "ID", "+62", 9, 11],
    ["🇵🇭", "PH", "+63", 10, 10], ["🇹🇭", "TH", "+66", 9, 9], ["🇻🇳", "VN", "+84", 9, 10],
    ["🇨🇳", "CN", "+86", 11, 11], ["🇯🇵", "JP", "+81", 10, 10], ["🇰🇷", "KR", "+82", 9, 10],
    ["🇪🇬", "EG", "+20", 10, 10], ["🇳🇬", "NG", "+234", 10, 10], ["🇿🇦", "ZA", "+27", 9, 9],
    ["🇰🇪", "KE", "+254", 9, 9], ["🇧🇷", "BR", "+55", 10, 11], ["🇲🇽", "MX", "+52", 10, 10]
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
    ".zkr-ta{width:100%;padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:8px;font-family:inherit;font-size:13px;min-height:52px;resize:vertical;outline:0;margin-bottom:8px;background:#fff}" +
    ".zkr-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:6px}" +
    "@media(max-width:520px){.zkr-row{grid-template-columns:1fr}}" +
    ".zkr-row input{padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:8px;font-family:inherit;font-size:13px;outline:0;background:#fff;width:100%}" +
    ".zkr-lbl{font-size:11px;font-weight:600;color:#374151;margin:2px 0 4px}" +
    ".zkr-lbl b{color:#dc2626}" +
    ".zkr-phone{display:flex;gap:4px}" +
    ".zkr-phone select{flex:0 0 auto;max-width:110px;padding:10px 4px;border:1.5px solid #e5e7eb;border-radius:8px;font-family:inherit;font-size:13px;outline:0;background:#fff;cursor:pointer}" +
    ".zkr-phone input{flex:1;min-width:0}" +
    ".zkr-invalid{border-color:#dc2626!important;background:#fef2f2!important}" +
    ".zkr-err{font-size:12px;color:#dc2626;font-weight:600;min-height:15px;margin:2px 0 8px}" +
    ".zkr-note{font-size:10px;color:#9ca3af;text-align:center;margin-bottom:10px}" +
    ".zkr-sub{display:block;margin:0 auto;padding:10px 28px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit}" +
    ".zkr-sub:hover{background:#1d4ed8}.zkr-sub:disabled{opacity:.5;cursor:default}" +
    ".zkr-done{display:none;text-align:center;color:#16a34a;font-size:13px;font-weight:700;margin-top:10px}";

  function injectCSS() {
    if (document.getElementById("zkr-css")) return;
    var s = document.createElement("style"); s.id = "zkr-css"; s.textContent = CSS;
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

    var ccOpts = CC.map(function (c, i) { return '<option value="' + i + '">' + c[0] + " " + c[2] + "</option>"; }).join("");
    mount.innerHTML = "" +
      '<div class="zkr-t">How was your experience?</div>' +
      '<div class="zkr-emos">' +
        EMOS.map(function (e, i) { return '<button type="button" class="zkr-emo" data-r="' + (i + 1) + '" title="' + e[1] + '">' + e[0] + '</button>'; }).join("") +
      '</div>' +
      '<div class="zkr-more">' +
        '<div class="zkr-lbl">What issue did you face, or how can we improve?</div>' +
        '<textarea class="zkr-ta" placeholder="Tell us what went wrong or what to add (optional)"></textarea>' +
        '<div class="zkr-lbl">Your Name <b>*</b></div>' +
        '<div class="zkr-row" style="grid-template-columns:1fr">' +
          '<input class="zkr-name" type="text" placeholder="Your full name" required>' +
        '</div>' +
        '<div class="zkr-lbl">Mobile Number <b>*</b></div>' +
        '<div class="zkr-phone" style="margin-bottom:6px">' +
          '<select class="zkr-cc" title="Country">' + ccOpts + '</select>' +
          '<input class="zkr-num" type="tel" inputmode="numeric" maxlength="10" placeholder="10-digit mobile" required>' +
        '</div>' +
        '<div class="zkr-err"></div>' +
        '<div class="zkr-note">Name &amp; number only for follow-up — never shared or sold.</div>' +
        '<button type="button" class="zkr-sub">Submit Feedback</button>' +
      '</div>' +
      '<div class="zkr-done">Thank you! We\'ll use this to improve.</div>';

    var rating = 0;
    var emos = mount.querySelectorAll(".zkr-emo");
    var more = mount.querySelector(".zkr-more");
    var ccSel = mount.querySelector(".zkr-cc");
    var numEl = mount.querySelector(".zkr-num");
    var nameEl = mount.querySelector(".zkr-name");
    var errEl = mount.querySelector(".zkr-err");

    for (var i = 0; i < emos.length; i++) {
      (function (btn) {
        btn.onclick = function () {
          rating = parseInt(btn.getAttribute("data-r"), 10);
          for (var k = 0; k < emos.length; k++) emos[k].classList.toggle("on", k < rating);
          more.classList.add("show");
        };
      })(emos[i]);
    }

    // Keep only digits; cap length to the selected country's max.
    function maxLen() { return CC[parseInt(ccSel.value, 10) || 0][4]; }
    numEl.addEventListener("input", function () {
      var v = numEl.value.replace(/\D/g, "").slice(0, maxLen());
      if (v !== numEl.value) numEl.value = v;
    });
    ccSel.addEventListener("change", function () {
      var c = CC[parseInt(ccSel.value, 10) || 0];
      numEl.setAttribute("maxlength", String(c[4]));
      numEl.placeholder = (c[3] === c[4] ? c[3] : c[3] + "-" + c[4]) + "-digit mobile";
      numEl.value = numEl.value.replace(/\D/g, "").slice(0, c[4]);
    });

    mount.querySelector(".zkr-sub").onclick = function () {
      var btn = this;
      errEl.textContent = "";
      nameEl.classList.remove("zkr-invalid"); numEl.classList.remove("zkr-invalid");
      var name = nameEl.value.trim();
      var c = CC[parseInt(ccSel.value, 10) || 0];
      var digits = numEl.value.replace(/\D/g, "").replace(/^0+/, "");
      // Validation
      if (!name) { errEl.textContent = "Please enter your name."; nameEl.classList.add("zkr-invalid"); nameEl.focus(); return; }
      if (!digits) { errEl.textContent = "Please enter your mobile number."; numEl.classList.add("zkr-invalid"); numEl.focus(); return; }
      if (digits.length < c[3] || digits.length > c[4]) {
        errEl.textContent = "Enter a valid " + c[1] + " mobile number (" + (c[3] === c[4] ? c[3] : c[3] + "-" + c[4]) + " digits).";
        numEl.classList.add("zkr-invalid"); numEl.focus(); return;
      }
      var text = mount.querySelector(".zkr-ta").value.trim();
      var phone = c[2] + " " + digits;
      btn.disabled = true;
      fetch("/api/interview", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "feedback", source: source, rating: rating, text: text, name: name, phone: phone })
      }).catch(function () {});
      more.classList.remove("show");
      mount.querySelector(".zkr-done").style.display = "block";
    };
  }

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

  var cs = document.currentScript;
  var auto = !cs || cs.getAttribute("data-auto") !== "off";
  var src = cs ? cs.getAttribute("data-source") : "";
  if (auto) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { autoMount(src); });
    else autoMount(src);
  }
})();
