// ZapKitt Shared Tool API — handles ALL config-driven AI tools
// Single endpoint, different prompts per tool

function getProviders() {
  const providers = [];
  if (process.env.GROQ_API_KEY) providers.push({ name: "groq", url: "https://api.groq.com/openai/v1/chat/completions", key: process.env.GROQ_API_KEY, models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"], format: "openai" });
  if (process.env.GEMINI_API_KEY) providers.push({ name: "gemini", url: "https://generativelanguage.googleapis.com/v1beta", key: process.env.GEMINI_API_KEY, models: ["gemini-2.5-flash", "gemini-2.0-flash-lite"], format: "gemini" });
  if (process.env.OPENROUTER_API_KEY) providers.push({ name: "openrouter", url: "https://openrouter.ai/api/v1/chat/completions", key: process.env.OPENROUTER_API_KEY, models: ["meta-llama/llama-3.3-70b-instruct:free"], format: "openai" });
  if (process.env.CEREBRAS_API_KEY) providers.push({ name: "cerebras", url: "https://api.cerebras.ai/v1/chat/completions", key: process.env.CEREBRAS_API_KEY, models: ["llama-3.3-70b"], format: "openai" });
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
  var mt = Math.min(parseInt(maxTokens) || 2000, 4000);

  var result = await callAI(systemPrompt, prompt, mt, 0.5);
  if (result.error) return res.status(500).json({ error: "AI failed: " + result.error });

  var txt = result.text.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/\*\*/g, "").trim();
  return res.status(200).json({ result: txt, model: result.model });
}
