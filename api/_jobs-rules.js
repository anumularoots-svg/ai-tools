// ============================================================================
// ZapKitt Jobs V0.5 — Rule-based classification engine
//
// Runs BEFORE AI. Obvious IT/non-IT, H1B, sponsorship, and remote signals
// are detected by pattern matching. AI is only called when rules cannot
// reach the confidence threshold.
// ============================================================================
import {
  IT_CATEGORIES, NON_IT_PATTERNS,
  H1B_POSITIVE, H1B_NEGATIVE,
  SPONSOR_POSITIVE, SPONSOR_NEGATIVE,
  REMOTE_PATTERNS, AI_CONFIDENCE_THRESHOLD
} from './_jobs-config.js';

// ── IT classification ───────────────────────────────────────────────────────

export function classifyIT(title, description) {
  const text = (title || '') + ' ' + (description || '');
  const titleLower = (title || '').toLowerCase();

  // Check obvious non-IT first
  if (NON_IT_PATTERNS.test(titleLower)) {
    return { is_it_job: false, it_category: 'Non-IT', method: 'RULE', confidence: 0.95 };
  }

  // Check categories by title (high confidence)
  for (const [cat, regex] of Object.entries(IT_CATEGORIES)) {
    if (regex.test(titleLower)) {
      return { is_it_job: true, it_category: cat, method: 'RULE', confidence: 0.95 };
    }
  }

  // Check categories in full text (lower confidence)
  for (const [cat, regex] of Object.entries(IT_CATEGORIES)) {
    if (regex.test(text)) {
      return { is_it_job: true, it_category: cat, method: 'RULE', confidence: 0.75 };
    }
  }

  // Generic IT signals in title
  if (/\b(it|information\s+technology|computer|developer|programmer|coder|engineering)\b/i.test(titleLower)) {
    return { is_it_job: true, it_category: 'Other IT', method: 'RULE', confidence: 0.70 };
  }

  // Cannot determine — needs AI
  return { is_it_job: null, it_category: null, method: 'UNKNOWN', confidence: 0 };
}

// ── H1B classification ──────────────────────────────────────────────────────

export function classifyH1B(text) {
  if (!text) return { status: 'UNKNOWN', confidence: 0, evidence: '' };

  for (const re of H1B_NEGATIVE) {
    const m = text.match(re);
    if (m) {
      // Grab surrounding context for evidence
      const idx = text.indexOf(m[0]);
      const snippet = text.substring(Math.max(0, idx - 30), Math.min(text.length, idx + m[0].length + 30)).trim();
      return { status: 'NOT_SUPPORTED', confidence: 0.95, evidence: snippet };
    }
  }

  for (const re of H1B_POSITIVE) {
    const m = text.match(re);
    if (m) {
      const idx = text.indexOf(m[0]);
      const snippet = text.substring(Math.max(0, idx - 30), Math.min(text.length, idx + m[0].length + 30)).trim();
      return { status: 'EXPLICIT', confidence: 0.95, evidence: snippet };
    }
  }

  return { status: 'UNKNOWN', confidence: 0.5, evidence: '' };
}

// ── Sponsorship classification ──────────────────────────────────────────────

export function classifySponsorship(text) {
  if (!text) return { status: 'UNKNOWN', confidence: 0, evidence: '' };

  for (const re of SPONSOR_NEGATIVE) {
    const m = text.match(re);
    if (m) {
      const idx = text.indexOf(m[0]);
      const snippet = text.substring(Math.max(0, idx - 30), Math.min(text.length, idx + m[0].length + 30)).trim();
      return { status: 'NOT_SUPPORTED', confidence: 0.95, evidence: snippet };
    }
  }

  for (const re of SPONSOR_POSITIVE) {
    const m = text.match(re);
    if (m) {
      const idx = text.indexOf(m[0]);
      const snippet = text.substring(Math.max(0, idx - 30), Math.min(text.length, idx + m[0].length + 30)).trim();
      return { status: 'EXPLICIT', confidence: 0.95, evidence: snippet };
    }
  }

  return { status: 'UNKNOWN', confidence: 0.5, evidence: '' };
}

// ── Remote classification ───────────────────────────────────────────────────

export function classifyRemote(title, description, locationRaw) {
  const text = (title || '') + ' ' + (description || '') + ' ' + (locationRaw || '');

  // Check in order of specificity
  if (REMOTE_PATTERNS.REMOTE_GLOBAL.test(text)) return 'REMOTE_GLOBAL';
  if (REMOTE_PATTERNS.REMOTE_US.test(text)) return 'REMOTE_US';
  if (REMOTE_PATTERNS.HYBRID.test(text)) return 'HYBRID';
  if (REMOTE_PATTERNS.ONSITE.test(text)) return 'ONSITE';

  // USAJOBS-specific: TravelPercentage 0 + "multiple" locations → likely remote
  if (/\bremote\b/i.test(text)) return 'REMOTE_US'; // US gov jobs default to US

  return 'UNKNOWN';
}

// ── Skills extraction (simple keyword match) ────────────────────────────────

const SKILL_PATTERNS = [
  'Java', 'Python', 'JavaScript', 'TypeScript', 'C#', 'C\\+\\+', 'Go', 'Rust', 'Ruby', 'PHP', 'Swift', 'Kotlin',
  'React', 'Angular', 'Vue', 'Node\\.js', 'Spring Boot', 'Django', 'Flask', 'Express',
  'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Terraform', 'Jenkins', 'CI/CD',
  'SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Oracle', 'Cassandra',
  'Linux', 'Git', 'REST', 'GraphQL', 'Microservices',
  'Machine Learning', 'Deep Learning', 'NLP', 'TensorFlow', 'PyTorch',
  'SAP', 'Salesforce', 'ServiceNow', 'Power BI', 'Tableau',
  'Agile', 'Scrum', 'JIRA'
];

export function extractSkills(text) {
  if (!text) return [];
  const found = [];
  for (const skill of SKILL_PATTERNS) {
    const re = new RegExp('\\b' + skill + '\\b', 'i');
    if (re.test(text)) {
      // Normalize display name
      const display = skill.replace(/\\\+/g, '+').replace(/\\\./g, '.');
      if (!found.includes(display)) found.push(display);
    }
  }
  return found.slice(0, 20);
}

// ── Full classification pipeline ────────────────────────────────────────────

export function classifyJob(job) {
  const fullText = (job.title || '') + '\n' + (job.description || '');

  const it = classifyIT(job.title, job.description);
  const h1b = classifyH1B(fullText);
  const sponsorship = classifySponsorship(fullText);
  const remote = classifyRemote(job.title, job.description, job.location_raw);
  const skills = extractSkills(fullText);

  const needsAI = it.method === 'UNKNOWN' || it.confidence < AI_CONFIDENCE_THRESHOLD;

  return {
    is_it_job: it.is_it_job,
    it_category: it.it_category,
    classification_method: it.method,
    classification_confidence: it.confidence,
    h1b_status: h1b.status,
    h1b_confidence: h1b.confidence,
    h1b_evidence: h1b.evidence,
    sponsorship_status: sponsorship.status,
    sponsorship_confidence: sponsorship.confidence,
    sponsorship_evidence: sponsorship.evidence,
    remote_type: remote,
    skills: skills,
    needs_ai: needsAI
  };
}
