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

// Multi-key rotation: supports comma-separated keys per provider
// Example env: GEMINI_API_KEY=key1,key2,key3,key4,key5
// Each request picks a random key → distributes load across accounts
function pickKey(envValue) {
  if (!envValue) return null;
  const keys = envValue.split(",").map(function(k) { return k.trim(); }).filter(Boolean);
  return keys.length > 0 ? keys[Math.floor(Math.random() * keys.length)] : null;
}

function getProviders() {
  const providers = [];
  var k;
  k = pickKey(process.env.GROQ_API_KEY);
  if (k) {
    providers.push({ name: "groq", url: "https://api.groq.com/openai/v1/chat/completions", key: k, models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"], format: "openai" });
  }
  k = pickKey(process.env.GEMINI_API_KEY);
  if (k) {
    providers.push({ name: "gemini", url: "https://generativelanguage.googleapis.com/v1beta", key: k, models: ["gemini-2.5-flash", "gemini-2.0-flash-lite"], format: "gemini" });
  }
  k = pickKey(process.env.OPENROUTER_API_KEY);
  if (k) {
    providers.push({ name: "openrouter", url: "https://openrouter.ai/api/v1/chat/completions", key: k, models: ["meta-llama/llama-3.3-70b-instruct:free"], format: "openai" });
  }
  k = pickKey(process.env.CEREBRAS_API_KEY);
  if (k) {
    providers.push({ name: "cerebras", url: "https://api.cerebras.ai/v1/chat/completions", key: k, models: ["llama-3.3-70b"], format: "openai" });
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

// getAllKeys returns all keys for a provider (for retry on rate limit)
function getAllKeys(envName) {
  var val = process.env[envName];
  if (!val) return [];
  return val.split(",").map(function(k) { return k.trim(); }).filter(Boolean);
}

async function callAI(system, prompt, maxTokens, temp) {
  // Build provider configs with ALL available keys for retry
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

    // Shuffle keys so each request starts with random key
    for (var s = allKeys.length - 1; s > 0; s--) {
      var j = Math.floor(Math.random() * (s + 1));
      var tmp = allKeys[s]; allKeys[s] = allKeys[j]; allKeys[j] = tmp;
    }

    // Try each key, each model
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
          errors.push(cfg.name + "/" + model + "[key" + (ki+1) + "]: " + e.message);
          // If rate limited (429), try next key for same provider
          if (e.message.indexOf("429") >= 0) continue;
          // Other errors (auth, server) — skip to next model/provider
          break;
        }
      }
    }
  }

  if (!anyKey) return { error: "No API keys configured. Add GROQ_API_KEY or GEMINI_API_KEY in Vercel env vars." };
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
  const hasExp = u.experience && u.experience.length > 0 && u.experience[0].title;
  const hasSource = !!(u.existingResume || u.backgroundDesc);
  const pageTarget = yrs <= 2 ? 1 : 2;

  const bc = (u.experience || []).map(function(_, i) {
    if (yrs <= 2) return i === 0 ? 5 : 4;
    if (yrs <= 6) return [8, 6, 5][i] || 4;
    if (yrs <= 12) return [10, 7, 6, 5][i] || 4;
    return [10, 8, 6, 5, 4][i] || 3;
  });

  const sys = "You are an Executive Resume Writer and ATS Expert with 20+ years Fortune 500 recruiting experience. Return ONLY valid JSON. No markdown, no code fences, no explanation.\n\nPAGE TARGET: " + pageTarget + " page(s). Generate ENOUGH content to fill " + pageTarget + " full pages.\n\nRULES:\n1. NEVER fabricate companies, titles, dates, education. Use ONLY provided data.\n2. If EXISTING RESUME is pasted, EXTRACT ALL data from it: every role, education, certifications, skills.\n3. Every bullet: Action Verb + Technology + Business Impact + Metric. 80%+ bullets must have numbers.\n4. NEVER use: Responsible for, Worked on, Involved in, Handled.\n5. Power verbs ONLY: Architected, Spearheaded, Delivered, Reduced, Automated, Designed, Led, Implemented, Optimized.\n6. Skills grouped into categories. Do NOT include empty categories with no items.\n7. Summary: 6-8 lines, executive-level.\n8. highlights: 6-8 SHORT metric strings (2-5 words each). NOT long sentences.\n9. achievements: 6-8 measurable results as short strings.\n10. strengths: 6-9 SHORT professional keywords (2-3 words each). NOT sentences.\n11. Education: MUST extract from source resume if user didn't fill Step 4. NEVER return 'Not Applicable' or 'Not specified'.\n12. If source has multiple projects under one company, create SEPARATE experience entries.\n" + (yrs <= 2 ? "\nFRESHER: 1 page. Projects, internships, academics." : yrs <= 12 ? "\nPROFESSIONAL: 2 pages. Achievement-driven. 8-10 bullets for recent role." : "\nEXECUTIVE: 2-3 pages. Strategic leadership. 10 bullets for recent role.");

  var eduStr = "";
  if (u.degree) { eduStr = u.degree; if (u.university) eduStr += " — " + u.university; if (u.gradYear) eduStr += " (" + u.gradYear + ")"; }
  if (u.additionalEdu && u.additionalEdu.trim()) eduStr += (eduStr ? "\n" : "") + u.additionalEdu.trim();

  var p = "Generate a COMPLETE " + pageTarget + "-page resume JSON.\n\nCANDIDATE:\nName: " + u.fullName + "\nEmail: " + (u.email||"") + "\nPhone: " + (u.phone||"") + "\nLocation: " + (u.location||"") + "\nLinkedIn: " + (u.linkedin||"") + "\nGitHub: " + (u.github||"") + "\nTitle: " + (u.targetTitle||"") + "\nExperience: " + (u.totalExp||"0") + " years\n";
  
  p += "\nEDUCATION: " + (eduStr || (hasSource ? "EXTRACT from pasted resume below. Find degree, university, year. NEVER return Not Applicable." : "[none]"));
  p += "\nCERTIFICATIONS: " + (u.certifications || (hasSource ? "EXTRACT from pasted resume below." : "[none]"));
  p += "\nSKILLS: " + (u.techSkills || "EXTRACT from pasted resume. Group into categories. Only include categories with actual items.");
  if (u.softSkills) p += "\nSOFT SKILLS: " + u.softSkills;
  if (u.achievements) p += "\nACHIEVEMENTS: " + u.achievements;

  if (hasExp) {
    p += "\n\nWORK EXPERIENCE:";
    u.experience.forEach(function(e, i) { p += "\n" + e.title + " at " + e.company + " (" + e.start + " — " + e.end + ")" + (e.location ? ", " + e.location : "") + ". Write " + bc[i] + " STAR bullets." + (e.details ? "\nDetails: " + e.details : ""); });
  }

  if (u.existingResume) {
    p += "\n\nSOURCE RESUME (EXTRACT EVERYTHING from this):\n\"\"\"\n" + u.existingResume.substring(0, 5000) + "\n\"\"\"";
    if (!hasExp) {
      p += "\nCRITICAL: No Step 3 data. You MUST extract from source resume:\n- ALL roles with company, title, dates\n- ALL education with degree, university, year\n- ALL certifications\n- ALL skills grouped by category\n- For each role: " + (yrs <= 6 ? "8" : "10") + " STAR bullets with metrics\n- If source has project-wise experience (Project 1, Project 2), create SEPARATE experience entries for each project";
    }
  }
  if (u.backgroundDesc) p += "\n\nBACKGROUND:\n\"\"\"\n" + u.backgroundDesc.substring(0, 3000) + "\n\"\"\"";
  if (u.jobDescription) p += "\n\nJOB DESCRIPTION (weave keywords):\n\"\"\"\n" + u.jobDescription.substring(0, 3000) + "\n\"\"\"";

  p += "\n\nReturn ONLY this JSON:\n{\"personal\":{\"fullName\":\"" + u.fullName + "\",\"title\":\"\",\"headline\":\"\",\"email\":\"\",\"phone\":\"\",\"location\":\"\",\"linkedin\":\"\",\"github\":\"\"},\"highlights\":[\"SHORT metrics only\"],\"summary\":\"6-8 sentences\",\"achievements\":[{\"text\":\"\",\"metric\":\"\"}],\"skills\":[{\"category\":\"\",\"items\":[]}],\"certifications\":[{\"name\":\"\"}],\"experience\":[{\"title\":\"\",\"company\":\"\",\"location\":\"\",\"startDate\":\"Mon YYYY\",\"endDate\":\"Present\",\"client\":\"\",\"domain\":\"\",\"teamSize\":\"\",\"bullets\":[{\"text\":\"\"}]}],\"quantifiedAchievements\":[\"Reduced X by 60%\"],\"projectPortfolio\":[{\"client\":\"\",\"project\":\"\",\"type\":\"\",\"role\":\"\",\"duration\":\"\",\"teamSize\":\"\"}],\"education\":[{\"degree\":\"\",\"institution\":\"\",\"year\":\"\"}],\"coreCompetencies\":[\"short keywords\"],\"additionalInfo\":{\"currentLocation\":\"\",\"preferredLocation\":\"\",\"languages\":\"\"},\"strengths\":[\"SHORT keywords\"]}";
  p += "\n\nFINAL RULES:\n1. headline = 'Title | Specialization | Key Tech | Years'. Example: 'QA Automation Engineer | SDET  •  Selenium · Java · TestNG · REST Assured · CI/CD  •  4+ Years'\n2. highlights = SHORT metric strings max 5 words. Example: '4+ Yrs QA', '200+ Test Cases', '60% Faster Regression'.\n3. achievements = 6-8 items with SPECIFIC metrics.\n4. quantifiedAchievements = 6-8 measurable results. Example: 'Reduced regression execution time by 60%'.\n5. projectPortfolio = table data for each project the candidate worked on.\n6. coreCompetencies = 6-9 SHORT professional keywords.\n7. additionalInfo = location, preferred location, languages from source resume.\n8. education = ALL degrees with university and year. Extract from source.\n9. skills = Only categories WITH items.\n10. experience: For EACH project, create SEPARATE entry with client, domain, teamSize. Generate " + (yrs <= 6 ? "8-10" : "10") + " STAR bullets for recent role, 5-7 for older roles.\n11. strengths = SHORT keywords max 3 words each.\n12. fullName = \"" + u.fullName + "\"\n13. Fill " + pageTarget + " full pages completely.";

  const result = await callAI(sys, p, 6000, 0.3);
  if (result.error) return res.status(500).json({ error: "AI failed: " + result.error });
  try {
    const resume = JSON.parse(extractJSON(result.text));
    // Post-process: clean empty data
    if (resume.skills) resume.skills = resume.skills.filter(function(s) { return s.category && s.items && s.items.length > 0; });
    if (resume.education) resume.education = resume.education.filter(function(e) { return e.degree && e.degree !== "Not Applicable" && e.degree !== "N/A" && e.degree !== "Not specified"; });
    if (resume.certifications) resume.certifications = resume.certifications.filter(function(c) { return c.name && c.name.trim() && c.name !== "None" && c.name !== "N/A"; });
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
