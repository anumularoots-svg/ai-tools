// ============================================================================
// ZapKitt Jobs V0.5 — Configuration (single source of truth)
// ============================================================================

// ── IT search keywords (used by USAJOBS collector) ──────────────────────────
export const IT_SEARCH_KEYWORDS = [
  'software engineer', 'software developer', 'java developer', 'java engineer',
  '.net developer', 'c# developer', 'python developer', 'python engineer',
  'frontend developer', 'backend developer', 'full stack developer',
  'react developer', 'angular developer', 'node.js developer',
  'devops engineer', 'cloud engineer', 'aws engineer', 'azure engineer',
  'data engineer', 'data scientist', 'machine learning engineer', 'ai engineer',
  'cybersecurity', 'security engineer', 'qa engineer', 'test automation',
  'sap consultant', 'salesforce developer', 'servicenow developer',
  'power bi developer', 'business analyst', 'database administrator',
  'sql developer', 'linux administrator', 'system administrator',
  'network engineer', 'it specialist', 'it support'
];

// ── IT category mapping (title patterns → category) ─────────────────────────
export const IT_CATEGORIES = {
  'Software Engineering': /\b(software\s+(engineer|developer|development)|sde|swe)\b/i,
  'Java':        /\b(java)\b/i,
  '.NET':        /\b(\.net|dotnet|c#|csharp)\b/i,
  'Python':      /\b(python)\b/i,
  'Frontend':    /\b(frontend|front.end|react|angular|vue\.?js|ui\s+developer)\b/i,
  'Backend':     /\b(backend|back.end)\b/i,
  'Full Stack':  /\b(full.?stack)\b/i,
  'DevOps':      /\b(devops|dev.ops|site\s+reliability|sre)\b/i,
  'Cloud':       /\b(cloud\s+(engineer|architect|developer))\b/i,
  'AWS':         /\b(aws)\b/i,
  'Azure':       /\b(azure)\b/i,
  'GCP':         /\b(gcp|google\s+cloud)\b/i,
  'Data Engineering': /\b(data\s+engineer|etl|data\s+pipeline)\b/i,
  'Data Science':     /\b(data\s+scien|analytics\s+engineer)\b/i,
  'AI/ML':       /\b(machine\s+learn|artificial\s+intellig|ai\s+engineer|ml\s+engineer|deep\s+learn|nlp\s+engineer)/i,
  'Cybersecurity': /\b(cyber.?security|information\s+security|infosec|security\s+engineer|security\s+analyst)\b/i,
  'QA/Testing':  /\b(qa|quality\s+assurance|test\s+auto|sdet|test\s+engineer)\b/i,
  'SAP':         /\b(sap)\b/i,
  'Salesforce':  /\b(salesforce)\b/i,
  'ServiceNow':  /\b(servicenow)\b/i,
  'Power BI':    /\b(power\s*bi|tableau|business\s+intelligence)\b/i,
  'Business Analyst': /\b(business\s+analyst)\b/i,
  'IT Support':  /\b(it\s+support|help\s*desk|desktop\s+support|it\s+specialist)\b/i,
  'Networking':  /\b(network\s+(engineer|admin|architect)|cisco|ccna)\b/i,
  'Database':    /\b(database\s+admin|dba|oracle|sql\s+developer|sql\s+server)/i,
  'Linux':       /\b(linux\s+(admin|engineer)|unix)\b/i,
  'System Administration': /\b(system\s+admin|sysadmin|systems\s+engineer)\b/i
};

// ── Obvious non-IT titles (skip AI for these) ───────────────────────────────
export const NON_IT_PATTERNS = /\b(nurse|nursing|physician|doctor|dentist|pharmacist|teacher|instructor|professor|accountant|truck\s+driver|driver|cook|chef|restaurant|cashier|retail|janitor|custodian|plumber|electrician|mechanic|welder|carpenter|painter|landscap|security\s+guard|correctional|patrol\s+officer|firefight|paramedic|social\s+worker|therapist|counselor|chaplain|librarian|archivist|museum|curator|veterinar|postal|mail\s+carrier)\b/i;

// ── H1B signals ─────────────────────────────────────────────────────────────
export const H1B_POSITIVE = [
  /h.?1.?b\s+sponsor/i,
  /sponsor.*h.?1.?b/i,
  /h.?1.?b\s+visa\s+sponsor/i,
  /will\s+sponsor\s+h.?1.?b/i,
  /visa\s+sponsorship\s+available/i,
  /sponsorship\s+is\s+available/i
];

export const H1B_NEGATIVE = [
  /no\s+visa\s+sponsor/i,
  /does\s+not\s+sponsor/i,
  /not\s+sponsor/i,
  /sponsorship\s+not\s+available/i,
  /unable\s+to\s+sponsor/i,
  /cannot\s+sponsor/i,
  /will\s+not\s+sponsor/i,
  /without\s+sponsorship/i,
  /not\s+offer.*sponsor/i
];

// ── General sponsorship signals ─────────────────────────────────────────────
export const SPONSOR_POSITIVE = [
  /visa\s+sponsorship/i,
  /sponsorship\s+available/i,
  /will\s+sponsor/i,
  /employment\s+sponsorship/i,
  /immigration\s+sponsorship/i,
  /h.?1.?b\s+sponsor/i,
  /sponsorship\s+provided/i,
  /sponsor\s+qualified/i
];

export const SPONSOR_NEGATIVE = [
  /no\s+sponsor/i,
  /not\s+sponsor/i,
  /unable\s+to\s+sponsor/i,
  /without\s+sponsor/i,
  /cannot\s+sponsor/i,
  /will\s+not\s+sponsor/i,
  /sponsorship\s+not/i
];

// ── Remote patterns ─────────────────────────────────────────────────────────
export const REMOTE_PATTERNS = {
  REMOTE_US:     /\b(remote.*united\s+states|remote.*u\.?s\.?[^a-z]|telework.*eligible|100%?\s+remote|fully\s+remote)/i,
  REMOTE_GLOBAL: /\b(remote.*anywhere|remote.*global|remote.*worldwide)/i,
  HYBRID:        /\b(hybrid|flexible.*location|partial.*remote|some.*remote)/i,
  ONSITE:        /\b(on.?site|in.?office|in.?person|must.*report|physically.*present)/i
};

// ── AI classification threshold ─────────────────────────────────────────────
export const AI_CONFIDENCE_THRESHOLD = 0.7;

// ── Pagination ──────────────────────────────────────────────────────────────
export const MAX_PAGE_SIZE = 50;
export const DEFAULT_PAGE_SIZE = 25;
export const RETENTION_DAYS = 7;

// ── USAJOBS config ──────────────────────────────────────────────────────────
export const USAJOBS_BASE_URL = 'https://data.usajobs.gov/api/Search';
export const USAJOBS_MAX_PER_SEARCH = 100;
