// ZapKitt AI Resume API v2 — JSON + Legacy support
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
export default async function handler(req, res) {
  const origins = ["https://zapkitt.com", "https://www.zapkitt.com"];
  const o = req.headers.origin || "";
  res.setHeader("Access-Control-Allow-Origin", origins.includes(o) ? o : origins[0]);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "x";
  if (!checkRate(ip)) return res.status(429).json({ error: "Rate limit" });
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key missing" });
  const { prompt, system, max_tokens, mode, userData } = req.body;
  if (mode === "json" && userData) return jsonMode(res, apiKey, userData);
  return legacyMode(res, apiKey, prompt, system, max_tokens);
}
async function callGroq(apiKey, system, prompt, maxTokens, temp) {
  const models = ["llama-3.3-70b-versatile", "qwen/qwen3-32b"];
  for (const model of models) {
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: prompt }], max_tokens: maxTokens, temperature: temp })
      });
      if (!r.ok) continue;
      const d = await r.json();
      const txt = d.choices?.[0]?.message?.content;
      if (txt) return { text: txt, model };
    } catch (e) { continue; }
  }
  return null;
}
async function jsonMode(res, apiKey, u) {
  const yrs = parseInt(u.totalExp) || 0;
  const sys = `You are an expert resume writer producing premium, ATS-optimized resumes. Return ONLY valid JSON. No markdown, no code fences, no explanation.
CRITICAL RULES:
1. NEVER fabricate companies/titles/dates/education. Use ONLY provided data.
2. Every bullet starts with a UNIQUE power verb (Architected, Spearheaded, Delivered, Reduced, Automated, Designed, Led, Implemented, Optimized, Orchestrated, Streamlined, Championed, Engineered, Accelerated, Pioneered).
3. 70%+ bullets MUST include quantified metrics (%, $, time saved, team size, scale).
4. Skills MUST be grouped by category (e.g. "Cloud — AWS", "CI/CD & GitOps", "Containers & Orchestration").
5. Date format: ALWAYS "Mon YYYY" format (e.g. "Jan 2023", "Jun 2021"). For current role, endDate MUST be "Present" (not "current" or blank).
6. Summary MUST be 5-7 sentences covering: years of experience, specialization, key technologies, notable achievements, and career focus.
7. Achievements MUST have 4-5 items, each with a specific metric.
8. Strengths MUST have 6-8 professional strengths (e.g. "CI/CD Pipeline Architecture", "Cloud Cost Optimization", "Security-First DevOps", "Cross-Team Collaboration").
9. Education and certifications MUST never be empty if user provided them.
${yrs <= 2 ? "Fresher: focus on projects, internships, academics." : yrs <= 12 ? "Professional: focus on achievements and impact." : "Executive: focus on strategic leadership and transformation."}`;

  const bc = (u.experience || []).map((_, i) => yrs <= 2 ? (i===0?4:3) : yrs <= 12 ? ([7,5,4,3][i]||3) : ([8,6,5,4,3][i]||3));
  let p = `Generate resume JSON for:\nName: ${u.fullName}\nEmail: ${u.email||""}\nPhone: ${u.phone||""}\nLocation: ${u.location||""}\nLinkedIn: ${u.linkedin||""}\nGitHub: ${u.github||""}\nTitle: ${u.targetTitle||""}\nExperience: ${u.totalExp||"0"} years\n`;
  p += `\nEDUCATION: ${u.degree||"[none]"} ${u.university?"— "+u.university:""} ${u.gradYear?"("+u.gradYear+")":""}\n${u.additionalEdu||""}`;
  p += `\nCERTIFICATIONS: ${u.certifications||"[none]"}\nSKILLS: ${u.techSkills||"extract from experience"}`;
  if (u.achievements) p += `\nACHIEVEMENTS: ${u.achievements}`;
  if (u.experience?.length) {
    p += "\n\nWORK EXPERIENCE (use EXACTLY):";
    u.experience.forEach((e,i) => { p += `\n${e.title} at ${e.company} (${e.start} — ${e.end})${e.location?", "+e.location:""}. Write ${bc[i]} STAR bullets.${e.details?"\nDetails: "+e.details:""}`; });
  }
  if (u.existingResume) p += `\n\nEXISTING RESUME:\n"""\n${u.existingResume.substring(0,4000)}\n"""`;
  if (u.backgroundDesc) p += `\n\nBACKGROUND:\n"""\n${u.backgroundDesc.substring(0,3000)}\n"""`;
  if (u.jobDescription) p += `\n\nJOB DESCRIPTION:\n"""\n${u.jobDescription.substring(0,3000)}\n"""`;
  p += `\n\nReturn ONLY this JSON:\n{"personal":{"fullName":"${u.fullName}","title":"","email":"","phone":"","location":"","linkedin":"","github":""},"summary":"5-7 sentence professional summary","achievements":[{"text":"Achievement with metric","metric":"60%"}],"skills":[{"category":"Category Name","items":["skill1","skill2"]}],"experience":[{"title":"","company":"","location":"","startDate":"Mon YYYY","endDate":"Mon YYYY or Present","bullets":[{"text":"Power verb + STAR bullet with metric"}]}],"education":[{"degree":"","institution":"","year":""}],"certifications":[{"name":"","status":"completed"}],"strengths":["Strength 1","Strength 2","at least 6 strengths"]}`;
  p += `\nCRITICAL: fullName MUST be "${u.fullName}". Companies MUST match provided data. Dates MUST be "Mon YYYY" format (Jan 2023, not January 2023). Current role endDate MUST be "Present". Strengths array MUST have 6-8 items. JSON only.`;

  const result = await callGroq(apiKey, sys, p, 6000, 0.3);
  if (!result) return res.status(500).json({ error: "AI failed" });
  try {
    const resume = JSON.parse(extractJSON(result.text));
    return res.status(200).json({ resume, model: result.model });
  } catch (e) {
    return res.status(200).json({ result: result.text, model: result.model, jsonError: true });
  }
}
async function legacyMode(res, apiKey, prompt, system, maxTokens) {
  if (!prompt) return res.status(400).json({ error: "Prompt required" });
  const mt = Math.min(Math.max(parseInt(maxTokens)||1024, 100), 6000);
  const result = await callGroq(apiKey, system||"You are an expert resume writer.", prompt, mt, 0.5);
  if (!result) return res.status(500).json({ error: "AI failed" });
  let txt = result.text.replace(/<think>[\s\S]*?<\/think>/gi,"").replace(/\*\*/g,"").trim();
  return res.status(200).json({ result: txt, model: result.model });
}
