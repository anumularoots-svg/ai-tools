// ============================================================================
// ZapKitt Interview Engine (v2) — structured, multi-prompt architecture.
//
// This module is PURE: prompt builders + deterministic logic + a DB schema.
// It performs NO network calls itself — api/interview.js calls the AI and
// passes results back in. That keeps the whole deterministic core unit-testable
// without an API key or a database.
//
// Pipeline:
//   Resume Analyzer  -> structured resume JSON (skills, topics, weak areas)
//   Interview Planner-> ordered topic plan for the round
//   Question Gen     -> ONE question (no-repeat, resume/role/company aware, adaptive)
//   Answer Evaluator -> scores ONE answer
//   Difficulty Mgr   -> DETERMINISTIC (code): score>80 harder, <50 follow-up, else same
//   Final Report     -> aggregate scores + strengths/weaknesses + 30-day plan
// ============================================================================

// ── Difficulty ladder (Beginner -> Production Expert) ───────────────────────
export const LEVELS = ["beginner", "intermediate", "senior", "architect", "expert"];

// Difficulty Manager — 100% deterministic, no AI, no randomness.
//   score > 80  -> increase difficulty, ask a NEW question
//   score < 50  -> keep level, ask a FOLLOW-UP that digs into the weakness
//   50..80      -> maintain level, ask the next planned question
export function difficultyDecision(currentLevel, score) {
  let i = LEVELS.indexOf(currentLevel);
  if (i < 0) i = 1; // default intermediate
  const s = Number(score);
  if (!isFinite(s)) return { level: LEVELS[i], followup: false, action: "maintain" };
  if (s > 80) return { level: LEVELS[Math.min(i + 1, LEVELS.length - 1)], followup: false, action: "increase" };
  if (s < 50) return { level: LEVELS[i], followup: true, action: "followup" };
  return { level: LEVELS[i], followup: false, action: "maintain" };
}

// ── Question de-duplication (no-repeat) ─────────────────────────────────────
// Normalize a question to its semantic skeleton, then hash it. Catches exact
// repeats and trivial rewordings (punctuation/case/stop-word differences).
const STOP = new Set(("a an the is are was were do does did of to in on for and or " +
  "how what why when which who your you me tell about explain describe can could would " +
  "please give some any this that these those with without into onto have has").split(" "));

export function normalizeQuestion(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w && !STOP.has(w))
    .sort()               // order-insensitive so "EKS vs ECS" == "ECS vs EKS"
    .join(" ")
    .trim();
}

export function qHash(text) {
  const s = normalizeQuestion(text);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (((h << 5) + h) + s.charCodeAt(i)) >>> 0; // djb2
  return h.toString(36);
}

// True if `text` matches a question already asked (by hash).
export function isDuplicate(text, askedHashes) {
  if (!text) return false;
  const h = qHash(text);
  return (askedHashes || []).indexOf(h) >= 0;
}

// ── Topic tracking ──────────────────────────────────────────────────────────
// questions: [{ topic, score(optional) }]  |  plan: { topics: [..] }
export function coveredTopics(questions) {
  const seen = [];
  (questions || []).forEach(q => {
    const t = (q && q.topic ? String(q.topic) : "").trim().toLowerCase();
    if (t && seen.indexOf(t) < 0) seen.push(t);
  });
  return seen;
}

export function pendingTopics(plan, questions) {
  const cov = coveredTopics(questions);
  const planned = (plan && Array.isArray(plan.topics) ? plan.topics : []).map(t => String(t).trim());
  return planned.filter(t => cov.indexOf(t.toLowerCase()) < 0);
}

// Topics where the candidate scored below 50 — these get revisited / reported.
export function weakTopics(questions) {
  const weak = [];
  (questions || []).forEach(q => {
    if (!q || q.topic == null) return;
    const s = Number(q.score);
    if (isFinite(s) && s < 50) {
      const t = String(q.topic).trim().toLowerCase();
      if (t && weak.indexOf(t) < 0) weak.push(t);
    }
  });
  return weak;
}

// ── Round plans: how many of each question TYPE per tier ────────────────────
// Mirrors the product spec (Free 5 / R2 25 / R3 30).
export const ROUND_PLAN = {
  free: [
    { type: "resume", n: 1 }, { type: "technical", n: 1 }, { type: "scenario", n: 1 },
    { type: "scenario", n: 1 }, { type: "coding", n: 1 }
  ],
  r2: [
    { type: "resume", n: 5 }, { type: "technical", n: 5 }, { type: "production", n: 5 },
    { type: "troubleshooting", n: 5 }, { type: "system_design", n: 5 }
  ],
  r3: [
    { type: "coding", n: 10 }, { type: "cross_scenario", n: 10 }, { type: "hr", n: 5 }
  ]
};

// The question TYPE required at 1-based slot `qn` for a tier (drives the planner/generator).
export function slotType(tier, qn) {
  const plan = ROUND_PLAN[tier] || ROUND_PLAN.free;
  let acc = 0;
  for (const seg of plan) { acc += seg.n; if (qn <= acc) return seg.type; }
  return plan[plan.length - 1].type;
}

export function totalQuestions(tier) {
  return (ROUND_PLAN[tier] || ROUND_PLAN.free).reduce((a, s) => a + s.n, 0);
}

// ── DB / session schema (stored in Upstash as JSON, or held client-side) ────
// One record per interview attempt.
export function newSession(fields) {
  fields = fields || {};
  return {
    session_id: fields.session_id || "",
    resume_hash: fields.resume_hash || "",
    role: fields.role || "",
    company: fields.company || "",
    experience: fields.experience || "",
    tier: fields.tier || "free",
    level: fields.level || "intermediate",
    analysis: fields.analysis || null,   // Resume Analyzer output
    plan: fields.plan || { topics: [] },  // Interview Planner output
    questions: []                         // [{ question_id, topic, type, difficulty, hash, text, answered, score, evaluation }]
  };
}

export function recordQuestion(session, q) {
  session.questions = session.questions || [];
  session.questions.push({
    question_id: session.questions.length + 1,
    topic: q.topic || "",
    type: q.type || "",
    difficulty: q.difficulty || session.level,
    hash: qHash(q.text || q.question || ""),
    text: q.text || q.question || "",
    answered: false,
    score: null,
    evaluation: null
  });
  return session;
}

export function recordAnswer(session, evaluation) {
  const list = session.questions || [];
  const last = list[list.length - 1];
  if (last) {
    last.answered = true;
    last.score = evaluation && isFinite(Number(evaluation.score)) ? Number(evaluation.score) : 0;
    last.evaluation = evaluation || null;
  }
  return session;
}

export function askedHashes(session) {
  return (session.questions || []).map(q => q.hash).filter(Boolean);
}

// ============================================================================
// PROMPT BUILDERS — each returns { system, user }. AI must reply with JSON only.
// ============================================================================

const JSON_ONLY = "Respond with ONLY valid, parseable JSON. No markdown, no code fences, no commentary.";

// Prompt-1: Resume Analyzer
export function buildAnalyzerPrompt(resume, role, experience) {
  return {
    system: "You are a senior technical recruiter and resume analyst. Extract a precise, structured profile from the resume. " + JSON_ONLY,
    user:
      "ROLE: " + (role || "Software Engineer") + "\nEXPERIENCE: " + (experience || "not specified") +
      "\n\nRESUME:\n" + (resume || "") +
      "\n\nReturn JSON exactly in this shape:\n" +
      '{"skills":["..."],"experience_years":0,"seniority":"beginner|intermediate|senior|architect|expert",' +
      '"projects":["short project summaries"],"technologies":["..."],"strong_areas":["..."],' +
      '"weak_areas":["topics likely weak or missing"],"question_topics":["10-15 specific interview topics grounded in THIS resume"]}'
  };
}

// Prompt-2: Interview Planner
export function buildPlannerPrompt(analysis, tier, role, company, experience) {
  const total = totalQuestions(tier);
  const dist = (ROUND_PLAN[tier] || ROUND_PLAN.free).map(s => s.n + "x " + s.type).join(", ");
  return {
    system: "You are an interview planner for a top MNC. Design a NON-REPEATING, resume-grounded question plan. " + JSON_ONLY,
    user:
      "ROLE: " + (role || "Software Engineer") + "\nCOMPANY: " + (company || "a top MNC") +
      "\nEXPERIENCE: " + (experience || "not specified") + "\nTIER: " + tier + " (" + total + " questions)" +
      "\nREQUIRED TYPE DISTRIBUTION: " + dist +
      "\n\nRESUME ANALYSIS:\n" + JSON.stringify(analysis || {}) +
      "\n\nProduce an ordered plan of EXACTLY " + total + " slots. Each slot has a distinct topic (no topic repeats) " +
      "drawn from the resume analysis and mapped to the required type for its position.\n" +
      'Return JSON: {"topics":["topic per slot, in order, length ' + total + '"],' +
      '"slots":[{"n":1,"type":"resume","topic":"...","difficulty":"intermediate"}]}'
  };
}

// Prompt-3 / Prompt-6: Question Generator (also used for the "next" question).
// `ctx` = { tier, qn, type, level, role, company, resume, analysis, askedQuestions:[], weak:[], pending:[], followup:false, lastAnswer }
export function buildQuestionPrompt(ctx) {
  ctx = ctx || {};
  const followup = !!ctx.followup;
  const s =
    "You are a warm but sharp interviewer at " + (ctx.company || "a top MNC") + " for a " + (ctx.role || "Software Engineer") + " role. " +
    "Behave like a real human interviewer, not a form. " + JSON_ONLY + "\n\n" +
    "CURRENT DIFFICULTY: " + (ctx.level || "intermediate") + "\n" +
    "REQUIRED QUESTION TYPE: " + (ctx.type || "technical") + "\n" +
    "RESUME ANALYSIS: " + JSON.stringify(ctx.analysis || {}) + "\n" +
    (ctx.pending && ctx.pending.length ? "PENDING TOPICS (prefer these): " + ctx.pending.join(", ") + "\n" : "") +
    (ctx.weak && ctx.weak.length ? "WEAK TOPICS (worth probing): " + ctx.weak.join(", ") + "\n" : "");
  let u;
  if (followup) {
    u = "The candidate's last answer was weak or incomplete:\n\"" + (ctx.lastAnswer || "") + "\"\n\n" +
      "Ask ONE natural FOLLOW-UP on the SAME topic that digs into what they missed. Reference what they actually said. " +
      "Keep the SAME difficulty (" + (ctx.level || "intermediate") + ").";
  } else {
    u = "Generate ONE " + (ctx.type || "technical") + " question (Q" + (ctx.qn || 1) + "), difficulty " + (ctx.level || "intermediate") +
      ", grounded in the resume and specific to " + (ctx.role || "the role") + ".";
  }
  if (ctx.askedQuestions && ctx.askedQuestions.length) {
    u += "\n\nDO NOT ASK any of these already-asked questions or a close variant — pick a genuinely different sub-topic:\n- " +
      ctx.askedQuestions.slice(-40).join("\n- ");
  }
  u += "\n\nReturn JSON: {\"response\":\"1-2 sentence warm reaction to their previous answer (empty for the first question)\"," +
    "\"question\":\"the question text\",\"topic\":\"single short topic tag\",\"type\":\"" + (ctx.type || "technical") + "\"," +
    "\"difficulty\":\"" + (ctx.level || "intermediate") + "\",\"coding\":" + (ctx.type === "coding" ? "true" : "false") +
    ",\"followup\":" + (followup ? "true" : "false") + "}";
  return { system: s, user: u };
}

// Prompt-4: Answer Evaluator (ONE answer at a time — fast, per-turn).
export function buildAnswerEvalPrompt(question, answer, role) {
  const ans = (answer && String(answer).trim()) ? answer : "[No answer given]";
  return {
    system: "You are a strict senior interviewer for " + (role || "the role") + ". Evaluate ONLY the current answer, honestly. " + JSON_ONLY,
    user:
      "QUESTION: " + (question || "") + "\nCANDIDATE ANSWER: " + ans +
      "\n\nScore 0-10 against what the question actually asked. [No answer given]/empty/irrelevant = 0-1. Vague = 2-4. Solid = 6-8. Excellent, specific, metric-backed = 9-10. Never inflate.\n" +
      'Return JSON: {"score":0,"technical":0,"problem_solving":0,"communication":0,"confidence":0,' +
      '"weakness":"what was missing/wrong","strength":"what was good","ideal_answer":"the concrete correct answer a strong candidate gives (full working code for coding questions)"}' +
      "\nNOTE: score fields are 0-10."
  };
}

// Final Report — aggregate everything the session collected.
export function buildReportPrompt(session, qas) {
  const role = session.role || "the role";
  const co = session.company ? " at " + session.company : "";
  let s = "You are a senior hiring panel lead" + co + " writing the final report for a " + role + " candidate. " + JSON_ONLY + "\n\n";
  s += "You MUST cover EXACTLY these " + qas.length + " question-answer pairs, in order:\n\n";
  qas.forEach((p, i) => {
    const a = (p.a && String(p.a).trim()) ? p.a : "[No answer given]";
    s += "Q" + (i + 1) + " [" + (p.topic || "general") + "]: " + p.q + "\nANSWER " + (i + 1) + ": " + a + "\n\n";
  });
  s += 'Return JSON: {"overall_score":0,"overall_verdict":"Strong Hire|Hire|Lean Hire|No Hire",' +
    '"categories":{"technical":0,"production_thinking":0,"problem_solving":0,"communication":0,"resume_knowledge":0,"confidence":0},' +
    '"interview_readiness":"Ready|Needs Work|Not Ready",' +
    '"questions":[{"q":"","answer":"","score":0,"mistakes":"","ideal_answer":"","how_to_improve":""}],' +
    '"strong_areas":["..."],"weak_areas":["..."],"top_skills":["..."],"topics_to_improve":["..."],' +
    '"hiring_recommendation":"one honest paragraph","learning_plan_30_days":["day-by-day or week-by-week actionable items"]}\n';
  s += "Category scores are 0-100. Per-question score is 0-10. Judge each category honestly and independently.\n";
  s += "Do NOT try to compute overall_score yourself — set it to 0. The server computes it from your category scores using fixed weights (technical 35%, production_thinking 20%, problem_solving 15%, communication 10%, resume_knowledge 10%, confidence 10%) and derives the verdict from that. Your arithmetic is not used.";
  return { system: s, user: "Write the final report now. Output ONLY the JSON object." };
}

// ============================================================================
// SCORE RECONCILIATION — the report's headline number is computed here, in
// code, not by the model.
//
// The prompt tells the model the weights and asks it to produce the weighted
// average. Language models are unreliable at arithmetic, so the score a
// candidate saw could disagree with the categories printed right beside it,
// and with the per-question scores they were shown live during the session.
// A scoring product that contradicts itself is worse than no score.
//
// So: the model supplies judgement (category scores, per-answer scores,
// written feedback). The arithmetic and the verdict band are ours.
// ============================================================================
export const CATEGORY_WEIGHTS = {
  technical: 0.35,
  production_thinking: 0.20,
  problem_solving: 0.15,
  communication: 0.10,
  resume_knowledge: 0.10,
  confidence: 0.10
};

function clamp(n, lo, hi) {
  const v = Number(n);
  if (!isFinite(v)) return null;
  return Math.max(lo, Math.min(hi, v));
}

// Weighted average over whatever categories the model actually returned.
// Missing categories are dropped and the weights renormalised, so an absent
// field lowers nothing unfairly.
export function computeOverallScore(categories) {
  if (!categories || typeof categories !== "object") return null;
  let sum = 0, weight = 0;
  for (const key of Object.keys(CATEGORY_WEIGHTS)) {
    const v = clamp(categories[key], 0, 100);
    if (v === null) continue;
    sum += v * CATEGORY_WEIGHTS[key];
    weight += CATEGORY_WEIGHTS[key];
  }
  if (!weight) return null;
  return Math.round(sum / weight);
}

// Published bands. Derived from the score so the verdict can never contradict
// the number printed next to it.
export function verdictFor(score) {
  if (score >= 80) return "Strong Hire";
  if (score >= 65) return "Hire";
  if (score >= 50) return "Lean Hire";
  return "No Hire";
}

export function readinessFor(score) {
  if (score >= 75) return "Ready";
  if (score >= 50) return "Needs Work";
  return "Not Ready";
}

// Rewrites the model's report in place-ish (returns a new object) so that:
//   - category scores are clamped to 0-100
//   - overall_score is the real weighted average of those categories
//   - verdict and readiness follow from that score
//   - per-question scores match the ones shown live during the session,
//     when the client supplied them
// `qas` entries may carry a `score` recorded at answer time; that is the
// authoritative one, because the candidate already saw it.
export function reconcileReport(report, qas) {
  const out = Object.assign({}, report || {});

  if (out.categories && typeof out.categories === "object") {
    const cats = {};
    for (const key of Object.keys(CATEGORY_WEIGHTS)) {
      const v = clamp(out.categories[key], 0, 100);
      if (v !== null) cats[key] = Math.round(v);
    }
    out.categories = cats;
  }

  const computed = computeOverallScore(out.categories);
  if (computed !== null) {
    out.overall_score = computed;
    out.overall_verdict = verdictFor(computed);
    // Both spellings appear across the two report shapes in this codebase.
    if ("interview_readiness" in out || !("hiring_readiness" in out)) out.interview_readiness = readinessFor(computed);
    if ("hiring_readiness" in out) out.hiring_readiness = readinessFor(computed);
  } else if (out.overall_score != null) {
    out.overall_score = clamp(out.overall_score, 0, 100);
  }

  // Per-question scores: prefer what the candidate was shown at answer time.
  if (Array.isArray(out.questions) && Array.isArray(qas)) {
    out.questions = out.questions.map((q, i) => {
      const src = qas[i];
      const live = src && isFinite(Number(src.score)) ? clamp(src.score, 0, 10) : null;
      const own = clamp(q && q.score, 0, 10);
      return Object.assign({}, q, { score: live !== null ? Math.round(live) : (own === null ? 0 : Math.round(own)) });
    });
  } else if (Array.isArray(out.questions)) {
    out.questions = out.questions.map(q => {
      const own = clamp(q && q.score, 0, 10);
      return Object.assign({}, q, { score: own === null ? 0 : Math.round(own) });
    });
  }

  return out;
}

// ── Robust JSON extraction (shared by callers) ──────────────────────────────
export function extractJSON(text) {
  let t = String(text || "").replace(/```json/gi, "").replace(/```/g, "").trim();
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) t = t.substring(a, b + 1);
  try { return JSON.parse(t); } catch (e) {
    t = t.replace(/[\x00-\x1f]/g, " ").replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");
    return JSON.parse(t); // throws to caller if still bad
  }
}
