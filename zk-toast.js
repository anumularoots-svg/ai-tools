/*!
 * ZapKitt Toast — replaces native alert() with clean toast notifications.
 * Also exposes window.zkToast(message, type, ms). type: info | success | error | warning
 * Zero-config: <script src="/zk-toast.js" defer></script>
 */
(function () {
  "use strict";
  if (window.__zkToast) return;
  window.__zkToast = true;

  var CSS =
    ".zkt-wrap{position:fixed;top:18px;right:18px;z-index:99999;display:flex;flex-direction:column;gap:10px;max-width:min(380px,calc(100vw - 32px));pointer-events:none;font-family:Inter,system-ui,-apple-system,'Segoe UI',sans-serif}" +
    ".zkt{pointer-events:auto;display:flex;align-items:flex-start;gap:11px;background:#fff;border:1px solid #E7ECF3;border-left:4px solid #2F88FF;border-radius:12px;padding:13px 14px;box-shadow:0 16px 40px -12px rgba(20,26,46,.28),0 4px 12px -6px rgba(20,26,46,.14);transform:translateX(120%);opacity:0;transition:transform .32s cubic-bezier(.16,1,.3,1),opacity .32s ease}" +
    ".zkt.show{transform:none;opacity:1}" +
    ".zkt.hide{transform:translateX(120%);opacity:0}" +
    ".zkt-ic{width:22px;height:22px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;font-weight:800;margin-top:1px}" +
    ".zkt-body{flex:1;min-width:0}" +
    ".zkt-msg{font-size:13.5px;line-height:1.5;color:#141A2E;font-weight:500;word-wrap:break-word}" +
    ".zkt-x{flex-shrink:0;background:none;border:none;color:#8A93A3;cursor:pointer;font-size:17px;line-height:1;padding:2px 4px;border-radius:6px;transition:color .15s,background .15s}" +
    ".zkt-x:hover{color:#141A2E;background:#F3F6FB}" +
    ".zkt-info{border-left-color:#2F88FF}.zkt-info .zkt-ic{background:#2F88FF}" +
    ".zkt-success{border-left-color:#10B981}.zkt-success .zkt-ic{background:#10B981}" +
    ".zkt-error{border-left-color:#E8215B}.zkt-error .zkt-ic{background:#E8215B}" +
    ".zkt-warning{border-left-color:#F59E0B}.zkt-warning .zkt-ic{background:#F59E0B}" +
    "@media(max-width:520px){.zkt-wrap{top:auto;bottom:16px;left:16px;right:16px;max-width:none}.zkt{transform:translateY(140%)}.zkt.hide{transform:translateY(140%)}}";

  var ICON = { info: "i", success: "✓", error: "!", warning: "!" };
  var wrap = null;

  function ensureWrap() {
    if (wrap && document.body.contains(wrap)) return wrap;
    var st = document.getElementById("zkt-css");
    if (!st) { st = document.createElement("style"); st.id = "zkt-css"; st.textContent = CSS; (document.head || document.documentElement).appendChild(st); }
    wrap = document.createElement("div"); wrap.className = "zkt-wrap"; wrap.setAttribute("aria-live", "polite");
    (document.body || document.documentElement).appendChild(wrap);
    return wrap;
  }

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  function toast(message, type, ms) {
    type = ["info", "success", "error", "warning"].indexOf(type) >= 0 ? type : "info";
    ms = typeof ms === "number" ? ms : 4200;
    var w = ensureWrap();
    var t = document.createElement("div");
    t.className = "zkt zkt-" + type; t.setAttribute("role", "status");
    t.innerHTML = '<span class="zkt-ic">' + (ICON[type] || "i") + '</span><div class="zkt-body"><div class="zkt-msg">' + esc(message) + '</div></div><button class="zkt-x" aria-label="Dismiss">×</button>';
    w.appendChild(t);
    // force reflow then show
    void t.offsetWidth; t.classList.add("show");
    var timer;
    function dismiss() { clearTimeout(timer); t.classList.remove("show"); t.classList.add("hide"); setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 340); }
    t.querySelector(".zkt-x").addEventListener("click", dismiss);
    if (ms > 0) timer = setTimeout(dismiss, ms);
    return { dismiss: dismiss };
  }

  window.zkToast = toast;

  // Guess a sensible type from the alert text so validation reads as a warning, failures as error.
  function guessType(msg) {
    var m = (msg || "").toLowerCase();
    if (/success|copied|saved|done|ready|sent/.test(m)) return "success";
    if (/error|failed|fail|wrong|invalid|unable|could ?n'?t|not able|try again/.test(m)) return "error";
    if (/please|enter|required|select|paste|add |must |first|too short|too long|choose/.test(m)) return "warning";
    return "info";
  }

  // Replace native alert with a toast (non-blocking).
  window.alert = function (msg) {
    try { toast(msg, guessType(msg)); } catch (e) { /* if DOM not ready, no-op */ }
  };
})();
