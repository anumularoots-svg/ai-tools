// ZapKitt AI API v4 — Multi-Provider Auto-Failover
// Groq → Google Gemini → OpenRouter → Cerebras
const rateMap = new Map();
function checkRate(ip) {
  const now = Date.now();
  const e = rateMap.get(ip);
  if (!e || now - e.start > 60000) { rateMap.set(ip, { start: now, count: 1 }); return true; }
  e.count++;
  return e.count <= 20;
}
function extractJSON(text) {
  let c = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  c = c.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
  const f = c.indexOf("{"); if (f > 0) c = c.substring(f);
  const l = c.lastIndexOf("}"); if (l >= 0) c = c.substring(0, l + 1);
  return c;
}

function getProviders() {
  const providers = [];
  if (process.env.GROQ_API_KEY) {
    providers.push({ name: "groq", url: "https://api.groq.com/openai/v1/chat/completions", key: process.env.GROQ_API_KEY, models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"], format: "openai" });
  }
  if (process.env.GEMINI_API_KEY) {
    providers.push({ name: "gemini", url: "https://generativelanguage.googleapis.com/v1beta", key: process.env.GEMINI_API_KEY, models: ["gemini-2.5-flash", "gemini-2.0-flash-lite"], format: "gemini" });
  }
  if (process.env.OPENROUTER_API_KEY) {
    providers.push({ name: "openrouter", url: "https://openrouter.ai/api/v1/chat/completions", key: process.env.OPENROUTER_API_KEY, models: ["meta-llama/llama-3.3-70b-instruct:free"], format: "openai" });
  }
  if (process.env.CEREBRAS_API_KEY) {
    providers.push({ name: "cerebras", url: "https://api.cerebras.ai/v1/chat/completions", key: process.env.CEREBRAS_API_KEY, models: ["llama-3.3-70b"], format: "openai" });
  }
  return providers;
}

async function callOpenAI(provider, model, system, prompt, maxTokens, temp) {
  const headers = { "Content-Type": "application/json", "Authorization": "Bearer " + provider.key };
  if (provider.name === "openrouter") { headers["HTTP-Referer"] = "https://zapkitt.com"; headers["X-Title"] = "ZapKitt"; }
  const r = await fetch(provider.url, {
    method: "POST", headers,
    body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: prompt }], max_tokens: maxTokens, temperature: temp })
  });
  if (!r.ok) { const e = await r.text().catch(function() { return ""; }); throw new Error(r.status + " " + e.substring(0, 150)); }
  const d = await r.json();
  return d.choices && d.choices[0] && d.choices[0].message ? d.choices[0].message.content : null;
}

async function callGemini(provider, model, system, prompt, maxTokens, temp) {
  const url = provider.url + "/models/" + model + ":generateContent?key=" + provider.key;
  const r = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system_instruction: { parts: [{ text: system }] }, contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: maxTokens, temperature: temp } })
  });
  if (!r.ok) { const e = await r.text().catch(function() { return ""; }); throw new Error(r.status + " " + e.substring(0, 150)); }
  const d = await r.json();
  return d.candidates && d.candidates[0] && d.candidates[0].content ? d.candidates[0].content.parts[0].text : null;
}

async function callAI(system, prompt, maxTokens, temp) {
  const providers = getProviders();
  if (providers.length === 0) return { error: "No API keys configured. Add GROQ_API_KEY or GEMINI_API_KEY in Vercel env vars." };
  const errors = [];
  for (var pi = 0; pi < providers.length; pi++) {
    var provider = providers[pi];
    for (var mi = 0; mi < provider.models.length; mi++) {
      var model = provider.models[mi];
      try {
        var text = provider.format === "gemini" ? await callGemini(provider, model, system, prompt, maxTokens, temp) : await callOpenAI(provider, model, system, prompt, maxTokens, temp);
        if (text) return { text: text, model: provider.name + "/" + model };
        errors.push(provider.name + "/" + model + ": empty response");
      } catch (e) { errors.push(provider.name + "/" + model + ": " + e.message); continue; }
    }
  }
  return { error: errors.join(" | ") };
}

export default async function handler(req, res) {
  const origins = ["https://zapkitt.com", "https://www.zapkitt.com"];
  const o = req.headers.origin || "";
  res.setHeader("Access-Control-Allow-Origin", origins.includes(o) ? o : origins[0]);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const ip = req.headers["x-forwarded-for"] ? req.headers["x-forwarded-for"].split(",")[0].trim() : "x";
  if (!checkRate(ip)) return res.status(429).json({ error: "Rate limit — try again in 1 minute" });
  const { prompt, system, max_tokens, mode, userData } = req.body;
  if (mode === "json" && userData) return jsonMode(res, userData);
  return legacyMode(res, prompt, system, max_tokens);
}

async function jsonMode(res, u) {
  const yrs = parseInt(u.totalExp) || 0;
  const sys = "You are an expert resume writer. Return ONLY valid JSON. No markdown, no code fences, no explanation, no thinking tags.\nRULES:\n1. NEVER fabricate companies/titles/dates/education. Use ONLY provided data.\n2. Every bullet starts with a power verb. 70%+ bullets include metrics.\n3. Skills grouped by category.\n4. Dates MUST be \"Mon YYYY\" format. Current role endDate = \"Present\".\n5. Summary: 5-7 sentences. Achievements: 4-5 items with metrics. Strengths: 6-8 items.\n6. Education and certifications MUST never be empty if provided.\n7. CRITICAL: Every achievement MUST include a specific number/percentage. Example: \"Reduced deployment times by 60%\" NOT \"Reduced deployment times by\". If no metric provided, estimate a realistic one.\n" + (yrs <= 2 ? "Fresher: focus on projects, academics." : yrs <= 12 ? "Professional: achievements and impact." : "Executive: strategic leadership.");
  const bc = (u.experience || []).map(function(_, i) { return yrs <= 2 ? (i===0?4:3) : yrs <= 12 ? ([7,5,4,3][i]||3) : ([8,6,5,4,3][i]||3); });
  var eduStr = "";
  if (u.degree) { eduStr = u.degree; if (u.university) eduStr += " — " + u.university; if (u.gradYear) eduStr += " (" + u.gradYear + ")"; }
  if (u.additionalEdu && u.additionalEdu.trim()) eduStr += (eduStr ? "\n" : "") + u.additionalEdu.trim();
  var p = "Generate resume JSON for:\nName: " + u.fullName + "\nEmail: " + (u.email||"") + "\nPhone: " + (u.phone||"") + "\nLocation: " + (u.location||"") + "\nLinkedIn: " + (u.linkedin||"") + "\nGitHub: " + (u.github||"") + "\nTitle: " + (u.targetTitle||"") + "\nExperience: " + (u.totalExp||"0") + " years\n";
  p += "\nEDUCATION:\n" + (eduStr || "[none provided]");
  p += "\nCERTIFICATIONS: " + (u.certifications || "[none]") + "\nSKILLS: " + (u.techSkills || "extract from experience");
  if (u.softSkills) p += "\nSOFT SKILLS: " + u.softSkills;
  if (u.achievements) p += "\nACHIEVEMENTS: " + u.achievements;
  if (u.experience && u.experience.length) {
    p += "\n\nWORK EXPERIENCE (use EXACTLY these):";
    u.experience.forEach(function(e, i) { p += "\n" + e.title + " at " + e.company + " (" + e.start + " — " + e.end + ")" + (e.location ? ", " + e.location : "") + ". Write " + bc[i] + " STAR bullets." + (e.details ? "\nDetails: " + e.details : ""); });
  }
  if (u.existingResume) p += "\n\nEXISTING RESUME:\n\"\"\"\n" + u.existingResume.substring(0, 4000) + "\n\"\"\"";
  if (u.backgroundDesc) p += "\n\nBACKGROUND:\n\"\"\"\n" + u.backgroundDesc.substring(0, 3000) + "\n\"\"\"";
  if (u.jobDescription) p += "\n\nJOB DESCRIPTION:\n\"\"\"\n" + u.jobDescription.substring(0, 3000) + "\n\"\"\"";
  p += "\n\nReturn ONLY this JSON:\n{\"personal\":{\"fullName\":\"" + u.fullName + "\",\"title\":\"\",\"email\":\"\",\"phone\":\"\",\"location\":\"\",\"linkedin\":\"\",\"github\":\"\"},\"summary\":\"5-7 sentences\",\"achievements\":[{\"text\":\"\",\"metric\":\"\"}],\"skills\":[{\"category\":\"\",\"items\":[]}],\"experience\":[{\"title\":\"\",\"company\":\"\",\"location\":\"\",\"startDate\":\"Mon YYYY\",\"endDate\":\"Mon YYYY or Present\",\"bullets\":[{\"text\":\"\"}]}],\"education\":[{\"degree\":\"\",\"institution\":\"\",\"year\":\"\"}],\"certifications\":[{\"name\":\"\",\"status\":\"completed\"}],\"strengths\":[\"6-8 professional strengths\"]}";
  p += "\nCRITICAL: Include ALL education. Dates = \"Mon YYYY\". Current role = \"Present\". Strengths = 6-8. fullName = \"" + u.fullName + "\".";
  const result = await callAI(sys, p, 6000, 0.3);
  if (result.error) return res.status(500).json({ error: "AI failed: " + result.error });
  try {
    const resume = JSON.parse(extractJSON(result.text));
    return res.status(200).json({ resume: resume, model: result.model });
  } catch (e) { return res.status(200).json({ result: result.text, model: result.model, jsonError: true }); }
}

async function legacyMode(res, prompt, system, maxTokens) {
  if (!prompt) return res.status(400).json({ error: "Prompt required" });
  const mt = Math.min(Math.max(parseInt(maxTokens)||1024, 100), 6000);
  const result = await callAI(system||"You are an expert resume writer.", prompt, mt, 0.5);
  if (result.error) return res.status(500).json({ error: "AI failed: " + result.error });
  var txt = result.text.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/\*\*/g, "").trim();
  return res.status(200).json({ result: txt, model: result.model });
}
