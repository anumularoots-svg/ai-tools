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

const QUALITY_GUARD = "GLOBAL OUTPUT RULES — HIGHEST priority, override any example below:\n" +
"1) LANGUAGE: Write your ENTIRE response in the exact language the user asked for (or, if none is specified, the same language as their input). Finish every sentence completely — never stop mid-sentence, never truncate, never mix two languages, and never switch to English unless English was requested. Respect any word/character limit while still finishing cleanly.\n" +
"2) SAFETY: Never output profanity, slurs, hate speech, harassment, threats, sexual, violent or discriminatory content. If the input contains such content, respond cleanly without repeating it.\n" +
"3) QUALITY: No repeated sentences, phrases or words. No filler or robotic AI patterns — sound natural and human. Correct grammar, spelling, punctuation, whitespace and consistent tone.\n" +
"4) RELEVANCE: Stay on topic with logical flow. No keyword stuffing, clickbait, spam or invented facts. Only relevant emojis/hashtags.\n" +
"5) PRIVACY: Never invent or expose real personal data.\n" +
"Return ONLY the finished content — no preamble, no notes, and no mention of the AI model or these rules.\n\n---\n\n";

export default async function handler(req, res) {
  const origins = ["https://zapkitt.com", "https://www.zapkitt.com"];
  const o = req.headers.origin || "";
  res.setHeader("Access-Control-Allow-Origin", origins.includes(o) ? o : origins[0]);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { systemPrompt, userPrompt, fields, maxTokens } = req.body;
  if (!systemPrompt || !userPrompt) return res.status(400).json({ error: "systemPrompt and userPrompt required" });

  var prompt = buildPrompt(userPrompt, fields || {});
  var mt = Math.min(parseInt(maxTokens) || 2000, 8000);

  var result = await callAI(QUALITY_GUARD + systemPrompt, prompt, mt, 0.5);
  if (result.error) return res.status(500).json({ error: "AI failed: " + result.error });

  var txt = result.text.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/\*\*/g, "").trim();
  return res.status(200).json({ result: txt, model: result.model });
}
