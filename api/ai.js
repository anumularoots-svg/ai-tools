// ZapKitt AI Resume API v3 — JSON + Legacy support
// Fixed: better models, error logging, qwen3 thinking mode
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
  if (!checkRate(ip)) return res.status(429).json({ error: "Rate limit — try again in 1 minute" });
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key missing — check Vercel env vars" });
  const { prompt, system, max_tokens, mode, userData } = req.body;
  if (mode === "json" && userData) return jsonMode(res, apiKey, userData);
  return legacyMode(res, apiKey, prompt, system, max_tokens);
}

async function callGroq(apiKey, system, prompt, maxTokens, temp) {
  // Production models first, then preview fallback
  const models = [
    { id: "llama-3.3-70b-versatile", maxOut: 32768 },
    { id: "openai/gpt-oss-120b", maxOut: 65536 },
    { id: "qwen/qwen3-32b", maxOut: 40960 },
    { id: "llama-3.1-8b-instant", maxOut: 131072 }
  ];
  const errors = [];

  for (const model of models) {
    try {
      const mt = Math.min(maxTokens, model.maxOut);
      const body = {
        model: model.id,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt }
        ],
        max_tokens: mt,
        temperature: temp
      };

      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify(body)
      });

      if (!r.ok) {
        const errBody = await r.text().catch(() => "");
        errors.push(`${model.id}: ${r.status} ${errBody.substring(0, 200)}`);
        continue;
      }

      const d = await r.json();
      const txt = d.choices?.[0]?.message?.content;
      if (txt) return { text: txt, model: model.id };
      errors.push(`${model.id}: empty response`);
    } catch (e) {
      errors.push(`${model.id}: ${e.message}`);
      continue;
    }
  }

  return { error: errors.join(" | ") };
}

async function jsonMode(res, apiKey, u) {
  const yrs = parseInt(u.totalExp) || 0;
  const sys = `You are an expert resume writer. Return ONLY valid JSON. No markdown, no code fences, no explanation, no thinking tags.
RULES:
1. NEVER fabricate companies/titles/dates/education. Use ONLY provided data.
2. Every bullet starts with a power verb. 70%+ bullets include metrics.
3. Skills grouped by category.
4. Dates MUST be "Mon YYYY" format. Current role endDate = "Present".
5. Summary: 5-7 sentences. Achievements: 4-5 items with metrics. Strengths: 6-8 items.
6. Education and certifications MUST never be empty if provided.
${yrs <= 2 ? "Fresher: focus on projects, academics." : yrs <= 12 ? "Professional: achievements and impact." : "Executive: strategic leadership."}`;

  const bc = (u.experience || []).map((_, i) => yrs <= 2 ? (i===0?4:3) : yrs <= 12 ? ([7,5,4,3][i]||3) : ([8,6,5,4,3][i]||3));

  // Build education string — include additional education
  let eduStr = "";
  if (u.degree) {
    eduStr = u.degree;
    if (u.university) eduStr += " — " + u.university;
    if (u.gradYear) eduStr += " (" + u.gradYear + ")";
  }
  if (u.additionalEdu && u.additionalEdu.trim()) {
    eduStr += (eduStr ? "\n" : "") + u.additionalEdu.trim();
  }

  let p = `Generate resume JSON for:\nName: ${u.fullName}\nEmail: ${u.email||""}\nPhone: ${u.phone||""}\nLocation: ${u.location||""}\nLinkedIn: ${u.linkedin||""}\nGitHub: ${u.github||""}\nTitle: ${u.targetTitle||""}\nExperience: ${u.totalExp||"0"} years\n`;
  p += `\nEDUCATION:\n${eduStr || "[none provided]"}`;
  p += `\nCERTIFICATIONS: ${u.certifications || "[none]"}\nSKILLS: ${u.techSkills || "extract from experience"}`;
  if (u.softSkills) p += `\nSOFT SKILLS: ${u.softSkills}`;
  if (u.achievements) p += `\nACHIEVEMENTS: ${u.achievements}`;
  if (u.experience?.length) {
    p += "\n\nWORK EXPERIENCE (use EXACTLY these companies/titles/dates):";
    u.experience.forEach((e,i) => { p += `\n${e.title} at ${e.company} (${e.start} — ${e.end})${e.location?", "+e.location:""}. Write ${bc[i]} STAR bullets.${e.details?"\nDetails: "+e.details:""}`; });
  }
  if (u.existingResume) p += `\n\nEXISTING RESUME:\n"""\n${u.existingResume.substring(0,4000)}\n"""`;
  if (u.backgroundDesc) p += `\n\nBACKGROUND:\n"""\n${u.backgroundDesc.substring(0,3000)}\n"""`;
  if (u.jobDescription) p += `\n\nJOB DESCRIPTION:\n"""\n${u.jobDescription.substring(0,3000)}\n"""`;

  p += `\n\nReturn ONLY this JSON (no other text):
{"personal":{"fullName":"${u.fullName}","title":"","email":"","phone":"","location":"","linkedin":"","github":""},"summary":"5-7 sentences","achievements":[{"text":"","metric":""}],"skills":[{"category":"","items":[]}],"experience":[{"title":"","company":"","location":"","startDate":"Mon YYYY","endDate":"Mon YYYY or Present","bullets":[{"text":""}]}],"education":[{"degree":"","institution":"","year":""}],"certifications":[{"name":"","status":"completed"}],"strengths":["6-8 professional strengths"]}`;
  p += `\nCRITICAL: Include ALL education entries (degree AND any additional education/post-graduation). Dates = "Mon YYYY". Current role = "Present". Strengths = 6-8 items. fullName = "${u.fullName}".`;

  const result = await callGroq(apiKey, sys, p, 6000, 0.3);
  if (result.error) return res.status(500).json({ error: "AI failed: " + result.error });
  try {
    const resume = JSON.parse(extractJSON(result.text));
    return res.status(200).json({ resume, model: result.model });
  } catch (e) {
    // Return raw text so frontend can still try to use it
    return res.status(200).json({ result: result.text, model: result.model, jsonError: true });
  }
}

async function legacyMode(res, apiKey, prompt, system, maxTokens) {
  if (!prompt) return res.status(400).json({ error: "Prompt required" });
  const mt = Math.min(Math.max(parseInt(maxTokens)||1024, 100), 6000);
  const result = await callGroq(apiKey, system||"You are an expert resume writer.", prompt, mt, 0.5);
  if (result.error) return res.status(500).json({ error: "AI failed: " + result.error });
  let txt = result.text.replace(/<think>[\s\S]*?<\/think>/gi,"").replace(/\*\*/g,"").trim();
  return res.status(200).json({ result: txt, model: result.model });
}
