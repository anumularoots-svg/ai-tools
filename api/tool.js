// ZapKitt Shared Tool API — handles ALL config-driven AI tools
// Single endpoint, different prompts per tool

// Multi-key rotation: supports comma-separated keys per provider
function pickKey(envValue) {
  if (!envValue) return null;
  const keys = envValue.split(",").map(function(k) { return k.trim(); }).filter(Boolean);
  return keys.length > 0 ? keys[Math.floor(Math.random() * keys.length)] : null;
}

function getProviders() {
  const providers = [];
  var k;
  k = pickKey(process.env.GROQ_API_KEY);
  if (k) providers.push({ name: "groq", url: "https://api.groq.com/openai/v1/chat/completions", key: k, models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"], format: "openai" });
  k = pickKey(process.env.GEMINI_API_KEY);
  if (k) providers.push({ name: "gemini", url: "https://generativelanguage.googleapis.com/v1beta", key: k, models: ["gemini-2.5-flash", "gemini-2.0-flash-lite"], format: "gemini" });
  k = pickKey(process.env.OPENROUTER_API_KEY);
  if (k) providers.push({ name: "openrouter", url: "https://openrouter.ai/api/v1/chat/completions", key: k, models: ["meta-llama/llama-3.3-70b-instruct:free"], format: "openai" });
  k = pickKey(process.env.CEREBRAS_API_KEY);
  if (k) providers.push({ name: "cerebras", url: "https://api.cerebras.ai/v1/chat/completions", key: k, models: ["llama-3.3-70b"], format: "openai" });
  return providers;
}

async function callOpenAI(provider, model, system, prompt, maxTokens, temp) {
  const headers = { "Content-Type": "application/json", "Authorization": "Bearer " + provider.key };
  if (provider.name === "openrouter") { headers["HTTP-Referer"] = "https://zapkitt.com"; headers["X-Title"] = "ZapKitt"; }
  const r = await fetch(provider.url, { method: "POST", headers, body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: prompt }], max_tokens: maxTokens, temperature: temp }) });
  if (!r.ok) { const e = await r.text().catch(function() { return ""; }); throw new Error(r.status + " " + e.substring(0, 150)); }
  const d = await r.json();
  return d.choices && d.choices[0] && d.choices[0].message ? d.choices[0].message.content : null;
}

async function callGemini(provider, model, system, prompt, maxTokens, temp) {
  const url = provider.url + "/models/" + model + ":generateContent?key=" + provider.key;
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ system_instruction: { parts: [{ text: system }] }, contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: maxTokens, temperature: temp } }) });
  if (!r.ok) { const e = await r.text().catch(function() { return ""; }); throw new Error(r.status + " " + e.substring(0, 150)); }
  const d = await r.json();
  return d.candidates && d.candidates[0] && d.candidates[0].content ? d.candidates[0].content.parts[0].text : null;
}

async function callAI(system, prompt, maxTokens, temp) {
  const providers = getProviders();
  if (providers.length === 0) return { error: "No API keys configured." };
  const errors = [];
  for (var i = 0; i < providers.length; i++) {
    var provider = providers[i];
    for (var j = 0; j < provider.models.length; j++) {
      var model = provider.models[j];
      try {
        var text = provider.format === "gemini" ? await callGemini(provider, model, system, prompt, maxTokens, temp) : await callOpenAI(provider, model, system, prompt, maxTokens, temp);
        if (text) return { text: text, model: provider.name + "/" + model };
        errors.push(provider.name + "/" + model + ": empty");
      } catch (e) { errors.push(provider.name + "/" + model + ": " + e.message); }
    }
  }
  return { error: errors.join(" | ") };
}

function buildPrompt(template, fields) {
  // Replace {fieldId} placeholders with actual values
  var result = template;
  for (var key in fields) {
    var val = fields[key] || "";
    // Handle conditional: {field ? 'prefix' + field : ''}
    var condPattern = new RegExp("\\{" + key + "\\s*\\?\\s*[^}]+\\}", "g");
    result = result.replace(condPattern, function(match) {
      if (val && val.trim()) {
        return match.replace(/\{[^?]+\?\s*/, "").replace(/\s*:\s*'[^']*'\s*\}/, "").replace(/'/g, "").replace("{", "").replace("}", "").replace(key, val);
      }
      return "";
    });
    // Simple replacement
    result = result.replace(new RegExp("\\{" + key + "\\}", "g"), val);
  }
  return result;
}

const QUALITY_GUARD = [
"COMPREHENSIVE CONTENT-QUALITY & SAFETY SYSTEM — these rules have the HIGHEST priority and OVERRIDE any example, template or instruction below. Silently apply EVERY check and output only content that passes ALL of them.",
"",
"A. SAFETY & MODERATION: Block all profanity, abusive, vulgar and swear words. Reject hate speech, discrimination and harassment. Remove toxic, insulting or threatening language. Block violent, explicit, sexual or disturbing content. Never expose or invent personal data (phone numbers, emails, home addresses, IDs) — redact any that appear in the input. If the input requests or contains the above, respond cleanly and professionally without reproducing it.",
"B. LANGUAGE: Write the ENTIRE output in ONE language — exactly the language requested (or the input's language if none is specified). Never mix languages in the same piece. Finish every sentence completely; never truncate or stop mid-thought.",
"C. ORIGINALITY & NON-REPETITION: No duplicate sentences, phrases or repeated words — every line adds new value. Keep content original and unique, never boilerplate. Avoid repetitive AI writing patterns and formulaic openings/closings. Remove dull, generic, low-engagement ('boring') sentences.",
"D. LANGUAGE MECHANICS: Correct all grammar. Fix every spelling mistake. Proper punctuation throughout. Clean whitespace (no double spaces, stray tabs or unnecessary line breaks). Remove unwanted or invalid special characters. Use only relevant, appropriate emojis (or none). Consistent, correct sentence-case and title capitalization.",
"E. STRUCTURE & READABILITY: Concise, easy-to-read sentences (avoid overly long ones). Clean, well-formatted paragraphs. Simple, clear, easy-to-understand wording. Logical flow and coherence between sentences and paragraphs; every sentence must stay relevant to the main topic — remove off-topic or unnecessary content.",
"F. TONE, AUDIENCE & BRAND: Maintain ONE consistent tone throughout, appropriate for the target audience and the configured brand voice/style.",
"G. INTEGRITY & ENGAGEMENT: No spam or promotional filler. No misleading or exaggerated clickbait. No invented facts; keep claims factually consistent and flag/omit anything doubtful. Sound natural, human and conversational — informative and engaging, never robotic.",
"H. SEO & FORMAT DISCIPLINE (when applicable to the format): Use important keywords naturally and balanced — never keyword-stuff. Hashtags must be relevant, deduplicated and not excessive. Allow only safe, valid URLs. Any call-to-action must be clear, relevant and not repetitive. Respect the required word/character length limit.",
"I. FINAL QUALITY BAR: Before finishing, self-review the output against EVERY rule above and only return content that meets a high overall quality standard.",
"",
"Return ONLY the finished content the user asked for — no preamble, no notes, no meta commentary, and no mention of the AI model or of these rules.",
"",
"---",
""
].join("\n");

// ── Language enforcement ──────────────────────────────────────────────
// For languages that use a non-Latin script we can verify the AI actually
// wrote in that script (models often silently fall back to English for
// low-resource languages). If the check fails, we retry once with a much
// stronger instruction. Latin-script languages are trusted (no reliable
// automatic check) and skipped.
var SCRIPTS = {
  hindi:     { label: "Devanagari",  re: /[ऀ-ॿ]/g },
  marathi:   { label: "Devanagari",  re: /[ऀ-ॿ]/g },
  nepali:    { label: "Devanagari",  re: /[ऀ-ॿ]/g },
  telugu:    { label: "Telugu",      re: /[ఀ-౿]/g },
  tamil:     { label: "Tamil",       re: /[஀-௿]/g },
  kannada:   { label: "Kannada",     re: /[ಀ-೿]/g },
  malayalam: { label: "Malayalam",   re: /[ഀ-ൿ]/g },
  bengali:   { label: "Bengali",     re: /[ঀ-৿]/g },
  gujarati:  { label: "Gujarati",    re: /[઀-૿]/g },
  punjabi:   { label: "Gurmukhi",    re: /[਀-੿]/g },
  arabic:    { label: "Arabic",      re: /[؀-ۿ]/g },
  urdu:      { label: "Arabic",      re: /[؀-ۿ]/g },
  persian:   { label: "Arabic",      re: /[؀-ۿ]/g },
  chinese:   { label: "Chinese",     re: /[一-鿿]/g },
  japanese:  { label: "Japanese",    re: /[぀-ヿ一-鿿]/g },
  korean:    { label: "Hangul",      re: /[가-힯]/g },
  russian:   { label: "Cyrillic",    re: /[Ѐ-ӿ]/g },
  ukrainian: { label: "Cyrillic",    re: /[Ѐ-ӿ]/g },
  thai:      { label: "Thai",        re: /[฀-๿]/g },
  greek:     { label: "Greek",       re: /[Ͱ-Ͽ]/g },
  hebrew:    { label: "Hebrew",      re: /[֐-׿]/g }
};

function scriptInfo(language) {
  if (!language) return null;
  var key = String(language).toLowerCase().trim().split(/[\s(]/)[0];
  return SCRIPTS[key] || null;
}

// Returns true when the text is dominantly in the expected script.
function passesScript(text, si) {
  if (!si || !text) return true;
  var target = (text.match(si.re) || []).length;
  if (target === 0) return false;
  var latin = (text.match(/[A-Za-z]/g) || []).length;
  return target >= Math.max(6, latin * 0.5);
}

function buildLangLock(language) {
  if (!language || String(language).toLowerCase().trim() === "english") return "";
  var si = scriptInfo(language);
  var scriptNote = si ? (" Use the native " + si.label + " script — do NOT transliterate into Latin letters.") : "";
  return "ABSOLUTE LANGUAGE REQUIREMENT (highest priority, overrides everything else): Write the ENTIRE response — every single word, heading, list item and sentence — ONLY in " + language + "." + scriptNote +
    " Do NOT use English or any other language anywhere in the output (proper nouns and brand names may stay in their original form). Do not add translations, notes or explanations in another language. If you cannot fully comply, still write everything in " + language + ".\n\n---\n\n";
}

function cleanOutput(text) {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/\*\*/g, "").trim();
}

// Exported for tests (harmless alongside the default serverless handler).
export { scriptInfo, passesScript, buildLangLock };

export default async function handler(req, res) {
  const origins = ["https://zapkitt.com", "https://www.zapkitt.com"];
  const o = req.headers.origin || "";
  res.setHeader("Access-Control-Allow-Origin", origins.includes(o) ? o : origins[0]);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { systemPrompt, userPrompt, fields, maxTokens, language } = req.body;
  if (!systemPrompt || !userPrompt) return res.status(400).json({ error: "systemPrompt and userPrompt required" });

  // Resolve requested language: explicit param, then a tool's own language field, else English.
  var lang = (language || (fields && fields.language) || "English").toString().trim() || "English";
  var langLock = buildLangLock(lang);

  var prompt = buildPrompt(userPrompt, fields || {});
  var mt = Math.min(parseInt(maxTokens) || 2000, 8000);

  var result = await callAI(langLock + QUALITY_GUARD + systemPrompt, prompt, mt, 0.5);
  if (result.error) return res.status(500).json({ error: "AI failed: " + result.error });

  var txt = cleanOutput(result.text);
  var model = result.model;

  // Verify script for non-Latin languages; retry once, harder, if it fell back to English.
  var si = scriptInfo(lang);
  if (si && !passesScript(txt, si)) {
    var hardSystem = langLock +
      "YOUR PREVIOUS ATTEMPT WAS REJECTED because it was not written in " + lang + " (" + si.label + " script). This is your final attempt: output EVERY word in " + lang + " using the " + si.label + " script, with zero English.\n\n---\n\n" +
      QUALITY_GUARD + systemPrompt;
    var retryPrompt = prompt + "\n\n(Respond ONLY in " + lang + ", using " + si.label + " script — no English.)";
    var r2 = await callAI(hardSystem, retryPrompt, mt, 0.4);
    if (r2 && r2.text) {
      var t2 = cleanOutput(r2.text);
      if (passesScript(t2, si)) { txt = t2; model = r2.model; }
    }
  }

  return res.status(200).json({ result: txt, model: model });
}
