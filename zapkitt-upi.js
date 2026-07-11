/*!
 * ZapKitt UPI QR modal — reusable donation/payment QR.
 * Fixes "Open UPI App" doing nothing on desktop: shows a scannable QR + UPI ID.
 * Auto-rewires every `upi://pay...` link on the page to open this modal instead.
 * Manual: ZapKittUPI.open({ amount: 9, note: "Round 2 unlock" });
 * Reuses the same qrcodejs library the QR-generator tool already uses.
 */
(function () {
  "use strict";
  if (window.ZapKittUPI) return;

  var UPI_PA = "9985933964-3@ybl";      // payee UPI ID
  var UPI_PN = "ZapKitt";               // payee name
  var QR_LIB = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";

  function upiLink(amount, note) {
    var s = "upi://pay?pa=" + encodeURIComponent(UPI_PA) + "&pn=" + encodeURIComponent(UPI_PN) + "&cu=INR";
    if (amount) s += "&am=" + encodeURIComponent(amount);
    if (note) s += "&tn=" + encodeURIComponent(note);
    return s;
  }

  var CSS = "" +
    ".zku-bd{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10000;display:none;align-items:center;justify-content:center;padding:16px;font-family:Inter,system-ui,sans-serif}" +
    ".zku-bd.show{display:flex}" +
    ".zku-m{background:#fff;border-radius:18px;padding:26px 24px;max-width:340px;width:100%;text-align:center;position:relative;box-shadow:0 20px 60px rgba(0,0,0,.3)}" +
    ".zku-x{position:absolute;top:10px;right:14px;font-size:24px;line-height:1;cursor:pointer;color:#9ca3af;background:none;border:none}" +
    ".zku-t{font-size:19px;font-weight:800;color:#111827;margin-bottom:2px}" +
    ".zku-s{font-size:13px;color:#6b7280;margin-bottom:16px}" +
    ".zku-qr{width:200px;height:200px;margin:0 auto 14px;padding:10px;background:#fff;border:1.5px solid #ede9fe;border-radius:12px;display:flex;align-items:center;justify-content:center}" +
    ".zku-qr img,.zku-qr canvas{width:180px!important;height:180px!important}" +
    ".zku-idbox{background:#f3f0ff;border:2px dashed #c4b5fd;border-radius:12px;padding:12px;margin-bottom:12px}" +
    ".zku-idlbl{font-size:11px;color:#6b7280;margin-bottom:3px}" +
    ".zku-id{font-size:16px;font-weight:700;color:#7c3aed;word-break:break-all}" +
    ".zku-copy{margin-top:8px;padding:6px 16px;background:#7c3aed;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit}" +
    ".zku-open{display:block;padding:11px;background:#2563eb;color:#fff;border-radius:9px;text-decoration:none;font-weight:700;font-size:14px;margin-bottom:8px}" +
    ".zku-hint{font-size:11px;color:#9ca3af}";

  var modal = null, qrHost = null, titleEl = null, subEl = null, openEl = null, idEl = null;

  function build() {
    if (modal) return;
    var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
    modal = document.createElement("div");
    modal.className = "zku-bd";
    modal.innerHTML =
      '<div class="zku-m">' +
        '<button class="zku-x" aria-label="Close">&times;</button>' +
        '<div class="zku-t">Support ZapKitt</div>' +
        '<div class="zku-s">Scan the QR with any UPI app</div>' +
        '<div class="zku-qr"><span style="color:#9ca3af;font-size:12px">Loading QR…</span></div>' +
        '<div class="zku-idbox"><div class="zku-idlbl">or pay to UPI ID</div><div class="zku-id">' + UPI_PA + '</div>' +
          '<button class="zku-copy">Copy UPI ID</button></div>' +
        '<a class="zku-open" href="#">Open UPI App (mobile)</a>' +
        '<div class="zku-hint">On desktop, scan the QR with your phone.</div>' +
      '</div>';
    document.body.appendChild(modal);
    qrHost = modal.querySelector(".zku-qr");
    titleEl = modal.querySelector(".zku-t");
    subEl = modal.querySelector(".zku-s");
    openEl = modal.querySelector(".zku-open");
    idEl = modal.querySelector(".zku-id");
    modal.querySelector(".zku-x").onclick = close;
    modal.onclick = function (e) { if (e.target === modal) close(); };
    modal.querySelector(".zku-copy").onclick = function () {
      var b = this;
      navigator.clipboard.writeText(UPI_PA).then(function () { b.textContent = "✓ Copied"; setTimeout(function () { b.textContent = "Copy UPI ID"; }, 1500); });
    };
  }

  function withLib(cb) {
    if (window.QRCode) return cb();
    var s = document.createElement("script"); s.src = QR_LIB;
    s.onload = function () { cb(); };
    s.onerror = function () { qrHost.innerHTML = '<span style="color:#9ca3af;font-size:12px">Use the UPI ID below 👇</span>'; };
    document.head.appendChild(s);
  }

  function renderQR(link) {
    qrHost.innerHTML = "";
    withLib(function () {
      try { qrHost.innerHTML = ""; new window.QRCode(qrHost, { text: link, width: 180, height: 180, correctLevel: window.QRCode.CorrectLevel.M }); }
      catch (e) { qrHost.innerHTML = '<span style="color:#9ca3af;font-size:12px">Use the UPI ID below 👇</span>'; }
    });
  }

  function open(opts) {
    opts = opts || {};
    build();
    var link = upiLink(opts.amount, opts.note);
    titleEl.textContent = opts.amount ? ("Pay ₹" + opts.amount) : "Support ZapKitt";
    subEl.textContent = opts.note || "Scan the QR with any UPI app";
    openEl.setAttribute("href", link);
    renderQR(link);
    modal.classList.add("show");
  }
  function close() { if (modal) modal.classList.remove("show"); }

  // Rewire every upi:// donation link on the page to open this modal (desktop-safe).
  function rewire() {
    var links = document.querySelectorAll('a[href^="upi://pay"]');
    for (var i = 0; i < links.length; i++) {
      (function (a) {
        var href = a.getAttribute("href") || "";
        var am = (href.match(/[?&]am=([^&]+)/) || [])[1];
        a.addEventListener("click", function (e) { e.preventDefault(); open({ amount: am ? decodeURIComponent(am) : "" }); });
      })(links[i]);
    }
  }

  window.ZapKittUPI = { open: open, close: close };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", rewire);
  else rewire();
})();
