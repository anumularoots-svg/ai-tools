/*!
 * ZapKitt Nav Dropdowns — TinyWow-style per-category mega dropdowns.
 * Each category is its OWN nav item; hover opens a panel with FEATURED tools (left,
 * icon + name + description) + OTHER tools (right, 2-col list) + "All X Tools" link.
 * Self-injecting, works on every page. <script src="/mega.js" defer></script>
 */
(function () {
  "use strict";
  if (window.__zkMega) return;
  window.__zkMega = true;

  var CATS = [
    { key: "resume", label: "Resume", all: "/resume-tools",
      featured: [
        ["AI Resume Builder", "/ai-resume-builder", "ATS-ready resume in 2 minutes", "📄", "#F1ECFF"],
        ["Mock Interview", "/ai-mock-interview", "Real-time AI interview practice", "🎤", "#FDEAF0"],
        ["Cover Letter Generator", "/ai-cover-letter", "Tailored to any job posting", "✉️", "#EAF3FF"],
        ["ATS Resume Checker", "/all-tools", "Score & optimize your resume", "✅", "#E9FBF3"]
      ],
      others: [["Resume Summary","/all-tools"],["Resume Skills","/all-tools"],["Resume Bullets","/ai-resume-bullets"],["Interview Questions","/all-tools"],["Salary Calculator","/all-tools"],["LinkedIn Headline","/all-tools"],["Resignation Letter","/all-tools"],["Thank You Email","/all-tools"]] },

    { key: "writing", label: "Writing", all: "/writing-tools",
      featured: [
        ["Email Writer", "/ai-email-writer", "Professional emails, fast", "✉️", "#FFF1E6"],
        ["Paraphraser", "/ai-paraphraser", "Reword & rewrite any text", "🔁", "#F1ECFF"],
        ["Grammar Checker", "/grammar-checker", "Fix grammar instantly", "✍️", "#E9FBF3"],
        ["Blog Writer", "/ai-blog-intro", "Full blog posts in seconds", "📝", "#EAF3FF"]
      ],
      others: [["Article Writer","/all-tools"],["Paragraph Generator","/all-tools"],["Story Generator","/all-tools"],["Product Description","/all-tools"],["LinkedIn Post","/ai-linkedin-post"],["Tweet Generator","/all-tools"],["Summarizer","/ai-summarizer"],["Translator","/ai-translator"]] },

    { key: "pdf", label: "PDF", all: "/all-tools",
      featured: [
        ["Merge PDF", "/merge-pdf", "Combine PDFs into one", "📕", "#FDEAF0"],
        ["Compress PDF", "/compress-pdf", "Shrink PDF file size", "🗜️", "#EAF3FF"],
        ["Split PDF", "/split-pdf", "Split into separate files", "✂️", "#FFF1E6"],
        ["PDF to JPG", "/pdf-to-jpg", "Export pages as images", "🖼️", "#F1ECFF"]
      ],
      others: [["PDF to Word","/all-tools"],["Word to PDF","/all-tools"],["Rotate PDF","/all-tools"],["Unlock PDF","/all-tools"],["Protect PDF","/all-tools"],["JPG to PDF","/image-to-pdf"],["Image to PDF","/image-to-pdf"],["Extract Text","/image-to-text"]] },

    { key: "image", label: "Image", all: "/all-tools",
      featured: [
        ["Image Compressor", "/image-compress", "Reduce image size", "🗜️", "#EAF3FF"],
        ["Image Resizer", "/image-resize", "Resize to any dimension", "📐", "#F1ECFF"],
        ["Image Cropper", "/image-crop", "Crop images precisely", "✂️", "#FFF1E6"],
        ["Image to Text", "/image-to-text", "Extract text (OCR)", "🔤", "#E9FBF3"]
      ],
      others: [["Background Remover","/all-tools"],["Image Upscaler","/all-tools"],["Image Converter","/jpg-to-png"],["Watermark Remover","/image-watermark-remover"],["Video Watermark Remover","/video-watermark-remover"],["JPG to PNG","/jpg-to-png"],["PNG to JPG","/png-to-jpg"],["QR Generator","/qr-generator"],["QR Scanner","/all-tools"]] },

    { key: "media", label: "Audio & Video", all: "/all-tools",
      featured: [
        ["Voice Recorder", "/voice-recorder", "Record voice in your browser", "🎙️", "#FDEAF0"],
        ["Screen Recorder", "/screen-recorder", "Record screen, no watermark", "🖥️", "#EAF3FF"],
        ["Audio Cutter", "/audio-cutter", "Trim MP3, WAV, M4A & OGG", "✂️", "#FFF1E6"],
        ["Video to GIF", "/video-to-gif", "Turn clips into animated GIFs", "🎬", "#F1ECFF"]
      ],
      others: [["Audio Converter","/audio-converter"],["Audio Joiner","/audio-joiner"],["Video Cutter","/video-cutter"],["ZIP Extractor & Maker","/zip-extractor"],["MP3 Converter","/audio-converter"],["Merge Audio","/audio-joiner"],["Trim Video","/video-cutter"],["Video Watermark Remover","/video-watermark-remover"]] },

    { key: "dev", label: "Developer", all: "/developer-tools",
      featured: [
        ["JSON Formatter", "/json-formatter", "Format & validate JSON", "💻", "#E4F7F4"],
        ["Base64 Encode/Decode", "/base64", "Convert Base64 both ways", "🔣", "#EAF3FF"],
        ["Password Generator", "/password-generator", "Strong secure passwords", "🔐", "#E9FBF3"],
        ["Color Picker", "/color-picker", "Pick & convert colors", "🎨", "#FDEAF0"]
      ],
      others: [["JSON Validator","/all-tools"],["JWT Decoder","/all-tools"],["SQL Formatter","/all-tools"],["HTML Formatter","/markdown-to-html"],["CSS Minifier","/all-tools"],["Regex Tester","/all-tools"],["Case Converter","/case-converter"],["Word Counter","/word-counter"]] }
  ];

  var CSS = ''
    + '.zk-nav-links,.nl,.nav-links,nav .nav-in{align-items:center!important}'
    + '.zkm2-trigger{display:inline-flex;align-items:center;gap:5px;color:#5B6472;font:600 14px Inter,system-ui,sans-serif;line-height:1;padding:9px 13px;margin:0;border-radius:8px;background:none;border:none;cursor:pointer;transition:color .18s,background .18s;text-decoration:none;white-space:nowrap;vertical-align:middle}'
    + '.zkm2-trigger:hover,.zkm2-trigger.on{color:#141A2E;background:#F3F6FB}'
    + '.zkm2-trigger svg{width:12px;height:12px;transition:transform .2s}'
    + '.zkm2-trigger.on svg{transform:rotate(180deg)}'
    + '.zkm2-panel{position:fixed;z-index:1200;display:flex;width:720px;max-width:calc(100vw - 32px);background:#fff;border:1px solid #E7ECF3;border-radius:16px;box-shadow:0 24px 60px -18px rgba(20,26,46,.30),0 8px 24px -12px rgba(20,26,46,.14);overflow:hidden;opacity:0;visibility:hidden;transform:translateY(-8px);transition:opacity .2s cubic-bezier(.16,1,.3,1),transform .2s cubic-bezier(.16,1,.3,1),visibility .2s;font-family:Inter,system-ui,sans-serif}'
    + '.zkm2-panel.open{opacity:1;visibility:visible;transform:none}'
    + '.zkm2-h{font:700 11px Inter,system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#8A93A3;margin-bottom:13px}'
    + '.zkm2-featured{width:280px;flex-shrink:0;padding:20px 18px;background:#FAFBFD;border-right:1px solid #EEF1F6}'
    + '.zkm2-fcard{display:flex;gap:12px;align-items:flex-start;padding:9px;border-radius:11px;text-decoration:none;transition:background .15s}'
    + '.zkm2-fcard:hover{background:#EAF3FF}'
    + '.zkm2-fic{width:42px;height:42px;border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}'
    + '.zkm2-fcard b{display:block;font:800 13.5px Inter,system-ui,sans-serif;color:#141A2E;letter-spacing:-.01em}'
    + '.zkm2-fcard small{display:block;font:400 12px Inter,system-ui,sans-serif;color:#8A93A3;margin-top:2px;line-height:1.35}'
    + '.zkm2-others{flex:1;padding:20px 24px}'
    + '.zkm2-olist{display:grid;grid-template-columns:1fr 1fr;gap:1px 18px}'
    + '.zkm2-olink{font:500 13.5px Inter,system-ui,sans-serif;color:#5B6472;padding:8px 8px;border-radius:7px;text-decoration:none;transition:color .14s,background .14s}'
    + '.zkm2-olink:hover{color:#2F88FF;background:#EAF3FF}'
    + '.zkm2-all{font:700 13.5px Inter,system-ui,sans-serif;color:#2F88FF;padding:9px 8px;text-decoration:none;display:inline-block}'
    + '.zkm2-all:hover{text-decoration:underline}'
    + '.model-badge,.model-info{display:none!important}'
    + '@media(max-width:900px){.zkm2-trigger{display:none}}';

  function build() {
    if (document.querySelector(".zkm2-trigger")) return;
    var host = document.querySelector(".zk-nav-left") || document.querySelector(".zk-nav-links") || document.querySelector(".nl") || document.querySelector(".nav-links") || document.querySelector("nav .nav-in") || document.querySelector("nav");
    var navEl = document.querySelector(".zk-nav") || document.querySelector(".nav") || document.querySelector(".nav-wrap") || document.querySelector("nav");
    if (!host) return;

    var st = document.createElement("style"); st.id = "zkm2-css"; st.textContent = CSS; document.head.appendChild(st);

    var open = null, timer;
    function navH() { return (navEl && navEl.offsetHeight) || 64; }

    var items = CATS.map(function (c) {
      var trig = document.createElement("button");
      trig.className = "zkm2-trigger";
      trig.innerHTML = c.label + ' <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"></path></svg>';
      trig.setAttribute("aria-haspopup", "true"); trig.setAttribute("aria-expanded", "false");

      var feat = c.featured.map(function (f) {
        return '<a class="zkm2-fcard" href="' + f[1] + '"><span class="zkm2-fic" style="background:' + f[4] + '">' + f[3] + '</span><span><b>' + f[0] + '</b><small>' + f[2] + '</small></span></a>';
      }).join("");
      var others = c.others.map(function (o) { return '<a class="zkm2-olink" href="' + o[1] + '">' + o[0] + '</a>'; }).join("");
      var panel = document.createElement("div");
      panel.className = "zkm2-panel";
      panel.innerHTML = '<div class="zkm2-featured"><div class="zkm2-h">Featured Tools</div>' + feat + '</div>'
        + '<div class="zkm2-others"><div class="zkm2-h">Other ' + c.label + ' Tools</div><div class="zkm2-olist">' + others + '</div><a class="zkm2-all" href="' + c.all + '">All ' + c.label + ' Tools →</a></div>';
      document.body.appendChild(panel);

      function show() {
        clearTimeout(timer);
        if (open && open !== panel) { open.classList.remove("open"); }
        CATS_trigs.forEach(function (t) { t.classList.remove("on"); t.setAttribute("aria-expanded", "false"); });
        trig.classList.add("on"); trig.setAttribute("aria-expanded", "true");
        var r = trig.getBoundingClientRect(), w = Math.min(720, window.innerWidth - 32);
        var left = Math.max(16, Math.min(r.left, window.innerWidth - w - 16));
        panel.style.top = navH() + "px"; panel.style.left = left + "px";
        panel.classList.add("open"); open = panel;
      }
      function hideSoon() { clearTimeout(timer); timer = setTimeout(function () { panel.classList.remove("open"); trig.classList.remove("on"); trig.setAttribute("aria-expanded", "false"); if (open === panel) open = null; }, 140); }
      trig.addEventListener("mouseenter", show);
      trig.addEventListener("click", function (e) { e.preventDefault(); panel.classList.contains("open") ? hideSoon() : show(); });
      trig.addEventListener("mouseleave", hideSoon);
      panel.addEventListener("mouseenter", function () { clearTimeout(timer); });
      panel.addEventListener("mouseleave", hideSoon);
      return { trig: trig, panel: panel };
    });
    var CATS_trigs = items.map(function (i) { return i.trig; });

    // insert triggers at the start of the nav links, in order
    var ref = host.firstChild;
    CATS_trigs.forEach(function (t) { host.insertBefore(t, ref); });

    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && open) { open.classList.remove("open"); CATS_trigs.forEach(function (t) { t.classList.remove("on"); }); open = null; } });
    document.addEventListener("click", function (e) {
      if (!open) return;
      var inTrig = CATS_trigs.some(function (t) { return t.contains(e.target); });
      if (!open.contains(e.target) && !inTrig) { open.classList.remove("open"); CATS_trigs.forEach(function (t) { t.classList.remove("on"); }); open = null; }
    });
    window.addEventListener("resize", function () { if (open) { CATS_trigs.forEach(function (t) { if (t.classList.contains("on")) t.dispatchEvent(new Event("mouseenter")); }); } });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
  else build();
})();
