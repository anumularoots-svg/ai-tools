// ============================================================================
// ZapKitt Jobs V0.5 — AI fallback for ambiguous job classification
//
// Called ONLY when the rule engine cannot determine classification with
// sufficient confidence. Reuses the existing ZapKitt AI provider chain.
// ============================================================================
import { callAI, extractJSON } from './_ai-core.js';

const SYSTEM_PROMPT = `You are a job classification engine. You receive a job title and description.
Respond with ONLY valid JSON, no markdown, no explanation.

Required JSON schema:
{
  "is_it_job": boolean,
  "it_category": string,
  "h1b_status": "EXPLICIT" | "UNKNOWN" | "NOT_SUPPORTED",
  "h1b_confidence": number (0-1),
  "h1b_evidence": string,
  "sponsorship_status": "EXPLICIT" | "UNKNOWN" | "NOT_SUPPORTED",
  "sponsorship_confidence": number (0-1),
  "sponsorship_evidence": string,
  "remote_type": "REMOTE_US" | "REMOTE_GLOBAL" | "HYBRID" | "ONSITE" | "UNKNOWN",
  "skills": string[]
}

IT categories: Software Engineering, Java, .NET, Python, Frontend, Backend, Full Stack, DevOps, Cloud, AWS, Azure, GCP, Data Engineering, Data Science, AI/ML, Cybersecurity, QA/Testing, SAP, Salesforce, ServiceNow, Power BI, Business Analyst, IT Support, Networking, Database, Linux, System Administration, Other IT, Non-IT

Rules:
- "Must be authorized to work in the US" does NOT mean H1B sponsorship. Mark as UNKNOWN.
- Only mark h1b_status as EXPLICIT if the text explicitly mentions H-1B/H1B sponsorship.
- Only mark sponsorship_status as EXPLICIT if visa sponsorship is explicitly offered.
- Return ONLY the JSON object. No other text.`;

export async function classifyWithAI(title, description) {
  const prompt = `Title: ${(title || '').slice(0, 200)}\n\nDescription:\n${(description || '').slice(0, 2000)}`;

  try {
    const result = await callAI(SYSTEM_PROMPT, prompt, 500, 0.1);
    if (result.error) {
      return { success: false, error: result.error };
    }

    const jsonStr = extractJSON(result.text);
    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      // Retry once with stricter instruction
      const retry = await callAI(
        SYSTEM_PROMPT + '\n\nYOUR PREVIOUS RESPONSE WAS INVALID JSON. Return ONLY a valid JSON object.',
        prompt, 500, 0.05
      );
      if (retry.error) return { success: false, error: retry.error };
      try {
        parsed = JSON.parse(extractJSON(retry.text));
      } catch (e2) {
        return { success: false, error: 'Invalid JSON after retry' };
      }
    }

    // Validate required fields
    if (typeof parsed.is_it_job !== 'boolean') parsed.is_it_job = false;
    if (typeof parsed.it_category !== 'string') parsed.it_category = 'Other IT';
    if (!['EXPLICIT', 'UNKNOWN', 'NOT_SUPPORTED'].includes(parsed.h1b_status)) parsed.h1b_status = 'UNKNOWN';
    if (!['EXPLICIT', 'UNKNOWN', 'NOT_SUPPORTED'].includes(parsed.sponsorship_status)) parsed.sponsorship_status = 'UNKNOWN';
    if (!['REMOTE_US', 'REMOTE_GLOBAL', 'HYBRID', 'ONSITE', 'UNKNOWN'].includes(parsed.remote_type)) parsed.remote_type = 'UNKNOWN';
    if (!Array.isArray(parsed.skills)) parsed.skills = [];

    return {
      success: true,
      model: result.model,
      classification: {
        is_it_job: parsed.is_it_job,
        it_category: parsed.it_category,
        classification_method: 'AI',
        classification_confidence: 0.85,
        h1b_status: parsed.h1b_status,
        h1b_confidence: Number(parsed.h1b_confidence) || 0.7,
        h1b_evidence: String(parsed.h1b_evidence || ''),
        sponsorship_status: parsed.sponsorship_status,
        sponsorship_confidence: Number(parsed.sponsorship_confidence) || 0.7,
        sponsorship_evidence: String(parsed.sponsorship_evidence || ''),
        remote_type: parsed.remote_type,
        skills: parsed.skills.map(s => String(s)).slice(0, 20)
      }
    };
  } catch (e) {
    return { success: false, error: String(e.message || e) };
  }
}
