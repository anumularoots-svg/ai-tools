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
  const sys = `You are an expert resume writer. Return ONLY valid JSON. No markdown, no code fences, no explanation.
RULES: Never fabricate companies/titles/dates/education. Use ONLY provided data. Every bullet starts with power verb. 70%+ bullets include metrics. Skills grouped by category.
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
  p += `\n\nReturn ONLY this JSON:\n{"personal":{"fullName":"${u.fullName}","title":"","email":"","phone":"","location":"","linkedin":"","github":""},"summary":"","achievements":[{"text":"","metric":""}],"skills":[{"category":"","items":[]}],"experience":[{"title":"","company":"","location":"","startDate":"","endDate":"","bullets":[{"text":""}]}],"education":[{"degree":"","institution":"","year":""}],"certifications":[{"name":"","status":"completed"}],"strengths":[]}`;
  p += `\nCRITICAL: fullName MUST be "${u.fullName}". Companies MUST match provided data. JSON only.`;

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
