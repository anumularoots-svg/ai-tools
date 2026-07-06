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

  // Determine bullet counts based on experience level and page target
  const bc = (u.experience || []).map(function(_, i) {
    if (yrs <= 2) return i === 0 ? 5 : 4;
    if (yrs <= 6) return [8, 6, 5][i] || 4;
    if (yrs <= 12) return [10, 7, 6, 5][i] || 4;
    return [10, 8, 6, 5, 4][i] || 3;
  });

  const sys = "You are an Executive Resume Writer, Senior Technical Recruiter, ATS Optimization Expert, and Hiring Manager with 20+ years of experience recruiting candidates for Fortune 500 companies.\n\nReturn ONLY valid JSON. No markdown, no code fences, no explanation, no thinking tags.\n\nPAGE TARGET: " + pageTarget + " page(s). Generate enough content to FILL " + pageTarget + " full page(s). For 2 pages: need 6-8 line summary, 6 highlights, 5+ achievements, 10+ bullets for recent role, 6-8 for older roles, grouped skills, project portfolio.\n\nRESUME STRUCTURE (MANDATORY — follow this EXACT order):\n1. FULL NAME + PROFESSIONAL HEADLINE (Title | Specialization | Key Tech | Years)\n2. CONTACT (Phone, Email, Location, LinkedIn, GitHub)\n3. PROFESSIONAL HIGHLIGHTS — 6-8 short metric cards: Total Experience, Enterprise Projects, Clients Served, End-to-End Implementations, Production Support, Business Impact, Certifications, Team Size Led\n4. PROFESSIONAL SUMMARY — 6-8 lines, executive-level, Fortune 500 recruiter voice. Include: total experience, specialization, industry exposure, project count, business achievements, key technologies, measurable impact.\n5. TECHNICAL SKILLS — Grouped into categories: Primary Technologies, Cloud Platforms, Programming Languages, Frameworks, Databases, DevOps, Monitoring, Security, Infrastructure-as-Code, CI/CD, Methodologies, Scripting. ONLY include skills the candidate actually has.\n6. CERTIFICATIONS — Only real ones provided. Never invent.\n7. PROFESSIONAL EXPERIENCE — Reverse chronological. For EACH role: Title, Company, Duration, Location. Then 6-10 STAR bullets with metrics.\n8. EDUCATION — Degree, University, Year\n9. CORE COMPETENCIES — 6-8 professional business competencies\n\nBULLET RULES:\n- Every bullet: Action Verb + Technology/Process + Business Impact + Measured Result\n- Power verbs ONLY: Architected, Spearheaded, Delivered, Reduced, Automated, Designed, Led, Implemented, Optimized, Orchestrated, Streamlined, Engineered, Accelerated, Pioneered, Deployed, Migrated, Transformed\n- NEVER use: Responsible for, Worked on, Involved in, Handled, Helped with, Duties included\n- 80%+ bullets MUST have specific metrics (%, $, time, team size, scale)\n- If no metrics provided, estimate REALISTIC ones based on the role\n- Each bullet 1-2 lines, achievement-oriented\n\nCRITICAL RULES:\n- NEVER fabricate companies, titles, dates, or education\n- If EXISTING RESUME is provided but no Step 3 experience, EXTRACT ALL roles from the pasted resume and generate full bullets for each\n- Skills must EXACTLY match what candidate provided — never add unrelated skills\n- If job description provided, naturally weave JD keywords into bullets and summary\n- If no job description, generate a strong general resume\n- ATS optimized: standard headings, reverse chronological, clean formatting\n" + (yrs <= 2 ? "\nFRESHER MODE: 1 page. Focus on projects, internships, hackathons, academics. Convert student activities into professional entries with STAR format. Include Projects section." : yrs <= 12 ? "\nPROFESSIONAL MODE: 2 pages. Achievement-driven. Every bullet shows business impact. Industry keywords. Professional Highlights with real metrics." : "\nEXECUTIVE MODE: 2-3 pages. Strategic leadership. P&L, team sizes, global scope, transformation. Recent roles: 10 detailed bullets. Older: 4-5 career progression bullets.");

  var eduStr = "";
  if (u.degree) { eduStr = u.degree; if (u.university) eduStr += " — " + u.university; if (u.gradYear) eduStr += " (" + u.gradYear + ")"; }
  if (u.additionalEdu && u.additionalEdu.trim()) eduStr += (eduStr ? "\n" : "") + u.additionalEdu.trim();

  var p = "Generate a COMPLETE " + pageTarget + "-page resume JSON for:\nName: " + u.fullName + "\nEmail: " + (u.email||"") + "\nPhone: " + (u.phone||"") + "\nLocation: " + (u.location||"") + "\nLinkedIn: " + (u.linkedin||"") + "\nGitHub: " + (u.github||"") + "\nTitle: " + (u.targetTitle||"") + "\nExperience: " + (u.totalExp||"0") + " years\n";
  p += "\nEDUCATION:\n" + (eduStr || (hasSource ? "[EXTRACT from pasted resume — look for degree, university, graduation year. NEVER return 'Not Applicable' if education exists in the source resume]" : "[none provided]"));
  p += "\nCERTIFICATIONS: " + (u.certifications || (hasSource ? "[EXTRACT from pasted resume — look for any certifications, courses, or training mentioned. NEVER return empty if certifications exist in the source resume]" : "[none]")) + "\nSKILLS: " + (u.techSkills || "extract from experience and source resume — group into 8+ categories, ONLY include skills actually mentioned, leave empty categories OUT");
  if (u.softSkills) p += "\nSOFT SKILLS: " + u.softSkills;
  if (u.achievements) p += "\nACHIEVEMENTS: " + u.achievements;

  if (hasExp) {
    p += "\n\nWORK EXPERIENCE (use EXACTLY these companies and titles):";
    u.experience.forEach(function(e, i) { p += "\n" + e.title + " at " + e.company + " (" + e.start + " — " + e.end + ")" + (e.location ? ", " + e.location : "") + ". Write " + bc[i] + " STAR bullets with metrics." + (e.details ? "\nDetails: " + e.details : ""); });
  }

  if (u.existingResume) {
    p += "\n\nEXISTING RESUME (CRITICAL — extract ALL information from this. If no Step 3 experience was provided, extract EVERY role, company, date, and achievement from this resume and generate full STAR bullets for each role):\n\"\"\"\n" + u.existingResume.substring(0, 5000) + "\n\"\"\"";
    if (!hasExp) {
      p += "\nIMPORTANT: No experience was entered in Step 3. You MUST:\n- Extract ALL work experience roles from the pasted resume\n- Extract ALL education (degrees, universities, years)\n- Extract ALL certifications\n- Extract ALL skills and group them into categories\n- For each role, generate " + (yrs <= 6 ? "8" : "10") + " STAR-format bullets with metrics\n- Do NOT return 'Not Applicable' for any field that has data in the source resume\n- Do NOT leave skill categories empty — only include categories that have actual skills";
    }
  }
  if (u.backgroundDesc) p += "\n\nBACKGROUND:\n\"\"\"\n" + u.backgroundDesc.substring(0, 3000) + "\n\"\"\"";
  if (u.jobDescription) p += "\n\nTARGET JOB DESCRIPTION (weave keywords naturally into resume):\n\"\"\"\n" + u.jobDescription.substring(0, 3000) + "\n\"\"\"";

  p += "\n\nReturn ONLY this JSON (generate ENOUGH content for " + pageTarget + " full pages):\n{\"personal\":{\"fullName\":\"" + u.fullName + "\",\"title\":\"\",\"email\":\"\",\"phone\":\"\",\"location\":\"\",\"linkedin\":\"\",\"github\":\"\"},\"highlights\":[\"6-8 short metric strings\"],\"summary\":\"6-8 line executive summary\",\"skills\":[{\"category\":\"\",\"items\":[]}],\"certifications\":[{\"name\":\"\",\"status\":\"completed\"}],\"experience\":[{\"title\":\"\",\"company\":\"\",\"location\":\"\",\"startDate\":\"Mon YYYY\",\"endDate\":\"Present\",\"client\":\"\",\"projectType\":\"\",\"teamSize\":\"\",\"bullets\":[{\"text\":\"\"}]}],\"quantifiedAchievements\":[\"Reduced regression by 60%\",\"Accelerated releases by 50%\"],\"projectPortfolio\":[{\"client\":\"\",\"project\":\"\",\"type\":\"\",\"role\":\"\",\"duration\":\"\",\"teamSize\":\"\"}],\"education\":[{\"degree\":\"\",\"institution\":\"\",\"year\":\"\"}],\"coreCompetencies\":[\"Test Strategy\",\"Automation Design\",\"Agile Delivery\"],\"additionalInfo\":{\"currentLocation\":\"\",\"preferredLocation\":\"\",\"languages\":\"\"},\"strengths\":[\"6-8 items\"]}";
  p += "\n\nCRITICAL FINAL RULES:\n1. Include ALL education — never skip any degree. NEVER return 'Not Applicable' — extract from source resume.\n2. Dates = \"Mon YYYY\". Current role endDate = \"Present\".\n3. highlights = 6-8 SHORT metric cards like: \"4+ Yrs QA Automation\", \"200+ Test Cases\", \"60% Faster Regression\". NOT long sentences.\n4. quantifiedAchievements = 6-8 specific measurable results as short strings.\n5. projectPortfolio = table data for each project.\n6. coreCompetencies = 6-9 SHORT professional keywords like: Test Strategy, Automation Design, Agile Delivery. NOT long sentences.\n7. If candidate has multiple projects under one company, create SEPARATE experience entries.\n8. fullName = \"" + u.fullName + "\" — never change.\n9. Generate MINIMUM " + (yrs <= 2 ? "5" : yrs <= 6 ? "8" : "10") + " bullets for the most recent role.\n10. Skills: ONLY include categories that have actual skills. Do NOT include empty categories like 'Monitoring:' with no items. Remove any category where items array is empty.\n11. Summary = 6-8 sentences.\n12. strengths/coreCompetencies = SHORT keywords only (2-3 words each), NOT long sentences.\n13. Total content must FILL " + pageTarget + " page(s) completely.\n14. If source resume has education, certifications, or skills — you MUST include them. Never ignore source data.";

  const result = await callAI(sys, p, 6000, 0.3);
  if (result.error) return res.status(500).json({ error: "AI failed: " + result.error });
  try {
    const resume = JSON.parse(extractJSON(result.text));
    // Post-process: remove empty skill categories
    if (resume.skills) {
      resume.skills = resume.skills.filter(function(s) { return s.category && s.items && s.items.length > 0; });
    }
    // Post-process: remove "Not Applicable" education
    if (resume.education) {
      resume.education = resume.education.filter(function(e) { return e.degree && e.degree !== "Not Applicable" && e.degree !== "N/A"; });
    }
    // Post-process: remove empty certifications
    if (resume.certifications) {
      resume.certifications = resume.certifications.filter(function(c) { return c.name && c.name.trim() && c.name !== "None" && c.name !== "N/A"; });
    }
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
