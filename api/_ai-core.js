// ============================================================================
// ZapKitt — shared AI core (extracted from api/ai.js)
//
// The multi-provider failover engine lives here so any module (resume, jobs,
// etc.) can call AI without duplicating the rotation/retry logic.
//
// Usage:  import { callAI, extractJSON } from './_ai-core.js';
// ============================================================================

function getAllKeys(envName) {
  var val = process.env[envName];
  if (!val) return [];
  return val.split(",").map(function (k) { return k.trim(); }).filter(Boolean);
}

async function callOpenAI(provider, model, system, prompt, maxTokens, temp) {
  const headers = { "Content-Type": "application/json", "Authorization": "Bearer " + provider.key };
  if (provider.name === "openrouter") { headers["HTTP-Referer"] = "https://zapkitt.com"; headers["X-Title"] = "ZapKitt"; }
  const r = await fetch(provider.url, {
    method: "POST", headers,
    body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: prompt }], max_tokens: maxTokens, temperature: temp })
  });
  if (!r.ok) { const e = await r.text().catch(function () { return ""; }); throw new Error(r.status + " " + e.substring(0, 150)); }
  const d = await r.json();
  return d.choices && d.choices[0] && d.choices[0].message ? d.choices[0].message.content : null;
}

async function callGemini(provider, model, system, prompt, maxTokens, temp) {
  const url = provider.url + "/models/" + model + ":generateContent?key=" + provider.key;
  const r = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system_instruction: { parts: [{ text: system }] }, contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: maxTokens, temperature: temp } })
  });
  if (!r.ok) { const e = await r.text().catch(function () { return ""; }); throw new Error(r.status + " " + e.substring(0, 150)); }
  const d = await r.json();
  return d.candidates && d.candidates[0] && d.candidates[0].content ? d.candidates[0].content.parts[0].text : null;
}

export async function callAI(system, prompt, maxTokens, temp) {
  var providerConfigs = [
    { name: "groq", envName: "GROQ_API_KEY", url: "https://api.groq.com/openai/v1/chat/completions", models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"], format: "openai" },
    { name: "gemini", envName: "GEMINI_API_KEY", url: "https://generativelanguage.googleapis.com/v1beta", models: ["gemini-2.5-flash", "gemini-2.0-flash-lite"], format: "gemini" },
    { name: "openrouter", envName: "OPENROUTER_API_KEY", url: "https://openrouter.ai/api/v1/chat/completions", models: ["meta-llama/llama-3.3-70b-instruct:free"], format: "openai" },
    { name: "cerebras", envName: "CEREBRAS_API_KEY", url: "https://api.cerebras.ai/v1/chat/completions", models: ["llama-3.3-70b"], format: "openai" }
  ];
  var errors = [];
  var anyKey = false;

  for (var pi = 0; pi < providerConfigs.length; pi++) {
    var cfg = providerConfigs[pi];
    var allKeys = getAllKeys(cfg.envName);
    if (allKeys.length === 0) continue;
    anyKey = true;

    for (var s = allKeys.length - 1; s > 0; s--) {
      var j = Math.floor(Math.random() * (s + 1));
      var tmp = allKeys[s]; allKeys[s] = allKeys[j]; allKeys[j] = tmp;
    }

    for (var ki = 0; ki < allKeys.length; ki++) {
      var provider = { name: cfg.name, url: cfg.url, key: allKeys[ki], format: cfg.format };
      for (var mi = 0; mi < cfg.models.length; mi++) {
        var model = cfg.models[mi];
        try {
          var text = provider.format === "gemini"
            ? await callGemini(provider, model, system, prompt, maxTokens, temp)
            : await callOpenAI(provider, model, system, prompt, maxTokens, temp);
          if (text) return { text: text, model: provider.name + "/" + model };
          errors.push(cfg.name + "/" + model + ": empty response");
        } catch (e) {
          errors.push(cfg.name + "/" + model + "[key" + (ki + 1) + "]: " + e.message);
          if (e.message.indexOf("429") >= 0) continue;
          break;
        }
      }
    }
  }

  if (!anyKey) return { error: "No API keys configured. Add GROQ_API_KEY or GEMINI_API_KEY in Vercel env vars." };
  return { error: errors.join(" | ") };
}

export function extractJSON(text) {
  let c = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  c = c.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
  const f = c.indexOf("{"); if (f > 0) c = c.substring(f);
  const l = c.lastIndexOf("}"); if (l >= 0) c = c.substring(0, l + 1);
  return c;
}
