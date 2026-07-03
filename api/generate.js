// ============================================
// ResumeGPT AI API — Groq Integration
// Sends structured prompt, receives JSON resume
// Validates before returning to frontend
// ============================================

import { buildUserPrompt, getSystemPrompt } from "../prompts/prompt-engine.js";
import { validateResume } from "../validator/resume-validator.js";

// Rate limiter
const rateMap = new Map();
const RATE_LIMIT = 20;
const RATE_WINDOW = 60000;

function checkRate(ip) {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now - entry.start > RATE_WINDOW) {
    rateMap.set(ip, { start: now, count: 1 });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT;
}

// Clean AI response — extract JSON from potential markdown/think blocks
function extractJSON(text) {
  // Remove <think>...</think>
  let clean = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  // Remove markdown code fences
  clean = clean.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
  // Remove any text before first {
  const firstBrace = clean.indexOf("{");
  if (firstBrace > 0) clean = clean.substring(firstBrace);
  // Remove any text after last }
  const lastBrace = clean.lastIndexOf("}");
  if (lastBrace >= 0) clean = clean.substring(0, lastBrace + 1);
  return clean;
}

export default async function handler(req, res) {
  // CORS
  const allowedOrigins = ["https://zapkitt.com", "https://www.zapkitt.com"];
  const origin = req.headers.origin || "";
  res.setHeader("Access-Control-Allow-Origin", allowedOrigins.includes(origin) ? origin : allowedOrigins[0]);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  // Rate limit
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  if (!checkRate(ip)) return res.status(429).json({ error: "Too many requests. Please wait." });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key not configured" });

  try {
    const { userData } = req.body;
    if (!userData || !userData.fullName) {
      return res.status(400).json({ error: "userData with fullName required" });
    }

    const totalYears = parseInt(userData.totalExp) || 0;
    const systemPrompt = getSystemPrompt(totalYears);
    const userPrompt = buildUserPrompt(userData);

    // Try multiple models
    const models = ["llama-3.3-70b-versatile", "qwen/qwen3-32b"];
    let lastError = "";

    for (const model of models) {
      try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            max_tokens: 6000,
            temperature: 0.4, // Lower temp for more consistent JSON
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          lastError = errData?.error?.message || `Model ${model} failed`;
          continue;
        }

        const data = await response.json();
        if (!data.choices?.[0]?.message?.content) {
          lastError = "Empty response from AI";
          continue;
        }

        // Extract and parse JSON
        const rawText = data.choices[0].message.content;
        const jsonStr = extractJSON(rawText);
        let resumeJSON;

        try {
          resumeJSON = JSON.parse(jsonStr);
        } catch (parseErr) {
          lastError = "AI returned invalid JSON";
          continue;
        }

        // Validate
        const validation = validateResume(resumeJSON, userData);

        return res.status(200).json({
          resume: resumeJSON,
          validation: {
            score: validation.score,
            passed: validation.passed,
            issues: validation.issues,
            summary: validation.summary,
          },
          model,
        });
      } catch (fetchErr) {
        lastError = fetchErr.message;
        continue;
      }
    }

    return res.status(500).json({ error: lastError || "All AI models failed." });
  } catch (e) {
    console.error("AI API Error:", e.message);
    return res.status(500).json({ error: "Something went wrong." });
  }
}
