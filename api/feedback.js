// ZapKitt — Reusable AI Feedback Engine
// One endpoint that analyzes ANY tool's output and returns a consistent
// feedback JSON: { overallScore, rating, confidence, strengths, issues, suggestions }
// Reuses the same multi-provider failover as /api/tool and /api/ai.

// ---- Provider plumbing (same pattern as api/tool.js) ----
function getAllKeys(envName) {
  var val = process.env[envName];
  if (!val) return [];
  return val.split(",").map(function (k) { return k.trim(); }).filter(Boolean);
}

function extractJSON(text) {
  var c = String(text || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  c = c.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
  var f = c.indexOf("{"); if (f > 0) c = c.substring(f);
  var l = c.lastIndexOf("}"); if (l >= 0) c = c.substring(0, l + 1);
  return c;
}

async function callOpenAI(provider, model, system, prompt, maxTokens, temp) {
  var headers = { "Content-Type": "application/json", "Authorization": "Bearer " + provider.key };
  if (provider.name === "openrouter") { headers["HTTP-Referer"] = "https://zapkitt.com"; headers["X-Title"] = "ZapKitt"; }
  var r = await fetch(provider.url, { method: "POST", headers: headers, body: JSON.stringify({ model: model, messages: [{ role: "system", content: system }, { role: "user", content: prompt }], max_tokens: maxTokens, temperature: temp }) });
  if (!r.ok) { var e = await r.text().catch(function () { return ""; }); throw new Error(r.status + " " + e.substring(0, 150)); }
  var d = await r.json();
  return d.choices && d.choices[0] && d.choices[0].message ? d.choices[0].message.content : null;
}

async function callGemini(provider, model, system, prompt, maxTokens, temp) {
  var url = provider.url + "/models/" + model + ":generateContent?key=" + provider.key;
  var r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ system_instruction: { parts: [{ text: system }] }, contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: maxTokens, temperature: temp } }) });
  if (!r.ok) { var e = await r.text().catch(function () { return ""; }); throw new Error(r.status + " " + e.substring(0, 150)); }
  var d = await r.json();
  return d.candidates && d.candidates[0] && d.candidates[0].content ? d.candidates[0].content.parts[0].text : null;
}

async function callAI(system, prompt, maxTokens, temp) {
  var providerConfigs = [
    { name: "groq", envName: "GROQ_API_KEY", url: "https://api.groq.com/openai/v1/chat/completions", models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"], format: "openai" },
    { name: "gemini", envName: "GEMINI_API_KEY", url: "https://generativelanguage.googleapis.com/v1beta", models: ["gemini-2.5-flash", "gemini-2.0-flash-lite"], format: "gemini" },
    { name: "openrouter", envName: "OPENROUTER_API_KEY", url: "https://openrouter.ai/api/v1/chat/completions", models: ["meta-llama/llama-3.3-70b-instruct:free"], format: "openai" },
    { name: "cerebras", envName: "CEREBRAS_API_KEY", url: "https://api.cerebras.ai/v1/chat/completions", models: ["llama-3.3-70b"], format: "openai" }
  ];
  var errors = [], anyKey = false;
  for (var pi = 0; pi < providerConfigs.length; pi++) {
    var cfg = providerConfigs[pi];
    var allKeys = getAllKeys(cfg.envName);
    if (allKeys.length === 0) continue;
    anyKey = true;
    for (var s = allKeys.length - 1; s > 0; s--) { var j = Math.floor(Math.random() * (s + 1)); var tmp = allKeys[s]; allKeys[s] = allKeys[j]; allKeys[j] = tmp; }
    for (var ki = 0; ki < allKeys.length; ki++) {
      var provider = { name: cfg.name, url: cfg.url, key: allKeys[ki], format: cfg.format };
      for (var mi = 0; mi < cfg.models.length; mi++) {
        var model = cfg.models[mi];
        try {
          var text = provider.format === "gemini"
            ? await callGemini(provider, model, system, prompt, maxTokens, temp)
            : await callOpenAI(provider, model, system, prompt, maxTokens, temp);
          if (text) return { text: text, model: provider.name + "/" + model };
          errors.push(cfg.name + "/" + model + ": empty");
        } catch (e) {
          errors.push(cfg.name + "/" + model + ": " + e.message);
          if (e.message.indexOf("429") >= 0) continue;
          break;
        }
      }
    }
  }
  if (!anyKey) return { error: "No API keys configured." };
  return { error: errors.join(" | ") };
}

// ---- Per-tool evaluation lenses ----
// Keyed by a `tool` slug/type the client sends. Falls back to a generic lens.
// Each entry: what a strong output looks like + the dimensions to score on.
var LENSES = {
  "resume-builder": "Judge as a Fortune-500 recruiter + ATS parser. Focus on: ATS compatibility, keyword/skill coverage, quantified achievements, weak/passive bullet points, grammar, and recruiter appeal.",
  "cover-letter": "Judge as a hiring manager. Focus on: tone, personalization to the company/role, opening hook, storytelling, conciseness, and the impression it leaves.",
  "interview": "Judge as a senior interviewer. Focus on: communication clarity, confidence, technical accuracy, structure (STAR), and filler words.",
  "email-writer": "Judge as a professional communication coach. Focus on: professionalism, clarity, subject-line quality, correct tone, call-to-action, and spam-trigger risk.",
  "cold-email": "Judge as a sales/outreach expert. Focus on: subject line, personalization, value proposition, brevity, CTA strength, and reply likelihood.",
  "linkedin-post": "Judge as a LinkedIn growth expert. Focus on: hook strength, readability, engagement potential, formatting (line breaks), hashtag quality, and CTA.",
  "social-caption": "Judge as a social media manager. Focus on: platform suitability, engagement potential, hook, CTA quality, and hashtag/emoji balance.",
  "blog": "Judge as an SEO content editor. Focus on: readability, SEO/keyword usage, structure, engagement, and depth vs fluff.",
  "grammar": "Judge as a professional editor. Focus on: grammar correctness, readability, sentence flow, clarity, and tone consistency.",
  "summary": "Judge as an editor. Focus on: whether key points are covered, faithfulness to source, conciseness, and any missing critical information.",
  "translator": "Judge as a bilingual linguist. Focus on: translation accuracy, tone/register preservation, natural fluency, and untranslated or awkward phrases.",
  "paraphrase": "Judge as an editor. Focus on: meaning preservation, originality vs source, fluency, and tone.",
  "code": "Judge as a senior engineer. Focus on: correctness, readability, complexity, security issues, error handling, and optimization opportunities.",
  "sql": "Judge as a database expert. Focus on: correctness, query efficiency, indexing opportunities, and readability.",
  "regex": "Judge as a regex expert. Focus on: correctness for the stated intent, edge cases handled/missed, and readability.",
  "seo": "Judge as an SEO specialist. Focus on: keyword optimization, title/meta length (title 50-60, meta 150-160 chars), click appeal, and search intent match."
};

function lensFor(tool) {
  var key = String(tool || "").toLowerCase();
  if (LENSES[key]) return LENSES[key];
  // loose contains-match so callers can pass slugs like "ai-email-writer"
  for (var k in LENSES) { if (key.indexOf(k) >= 0) return LENSES[k]; }
  return "Judge the output on overall quality. Focus on: accuracy, clarity, completeness, formatting, and how well it serves the user's goal.";
}

function clampInt(v, lo, hi, dflt) { var n = parseInt(v, 10); if (isNaN(n)) return dflt; return Math.max(lo, Math.min(hi, n)); }

export default async function handler(req, res) {
  var origins = ["https://zapkitt.com", "https://www.zapkitt.com"];
  var o = req.headers.origin || "";
  res.setHeader("Access-Control-Allow-Origin", origins.includes(o) ? o : origins[0]);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    var b = req.body || {};
    var tool = b.tool || b.toolLabel || "";
    var input = String(b.input || "").slice(0, 4000);
    var output = String(b.output || "").slice(0, 6000);
    if (!output.trim()) return res.status(400).json({ error: "output required" });

    var lens = lensFor(tool);
    var sys = "You are ZapKitt's AI Quality Analyst. You review the OUTPUT that another AI tool produced and give the user honest, actionable feedback.\n\n"
      + "TOOL BEING REVIEWED: " + (b.toolLabel || tool || "an AI tool") + ".\n"
      + "EVALUATION LENS: " + lens + "\n\n"
      + "Return ONLY valid JSON (no markdown, no code fences, no prose) in EXACTLY this shape:\n"
      + '{"overallScore":0-100,"rating":1-5,"confidence":0-100,"strengths":["short phrase",...],"issues":["short phrase",...],"suggestions":["specific actionable tip",...]}\n\n'
      + "RULES:\n"
      + "- overallScore: honest 0-100. Weak output MUST score low (30-55). Excellent output 85-100. Never inflate.\n"
      + "- rating: 1-5 stars, roughly overallScore/20.\n"
      + "- confidence: how sure you are of this assessment, 0-100.\n"
      + "- strengths: 2-4 SHORT phrases (2-6 words) — what is genuinely good.\n"
      + "- issues: 0-4 SHORT phrases — concrete problems (empty array if none).\n"
      + "- suggestions: 2-4 SPECIFIC, actionable improvements the user can act on now.\n"
      + "- Be specific to THIS output; never generic filler.";

    var usr = (input ? "USER INPUT / CONTEXT:\n\"\"\"\n" + input + "\n\"\"\"\n\n" : "")
      + "OUTPUT TO REVIEW:\n\"\"\"\n" + output + "\n\"\"\"\n\nAnalyze now. Output ONLY the JSON object.";

    var result = await callAI(sys, usr, 900, 0.3);
    if (result.error) return res.status(500).json({ error: "AI failed: " + result.error });

    var parsed;
    try { parsed = JSON.parse(extractJSON(result.text)); }
    catch (e) { return res.status(500).json({ error: "Could not parse feedback." }); }

    // Normalize / guard the shape so the widget can always render safely.
    var out = {
      overallScore: clampInt(parsed.overallScore, 0, 100, 75),
      rating: clampInt(parsed.rating, 1, 5, Math.max(1, Math.round(clampInt(parsed.overallScore, 0, 100, 75) / 20))),
      confidence: clampInt(parsed.confidence, 0, 100, 90),
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.filter(Boolean).slice(0, 4).map(String) : [],
      issues: Array.isArray(parsed.issues) ? parsed.issues.filter(Boolean).slice(0, 4).map(String) : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.filter(Boolean).slice(0, 4).map(String) : [],
      model: result.model
    };
    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
