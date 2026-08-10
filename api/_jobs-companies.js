// ============================================================================
// ZapKitt Jobs V1 — H1B-sponsoring tech companies (Greenhouse + Lever)
//
// Curated list of companies known to sponsor H1B visas for IT roles.
// board_id is the slug used in their public job board URL.
// ============================================================================

export const GREENHOUSE_COMPANIES = [
  // Big Tech / Major Sponsors
  { name: 'Airbnb', board_id: 'airbnb', h1b_known: true },
  { name: 'Coinbase', board_id: 'coinbase', h1b_known: true },
  { name: 'Stripe', board_id: 'stripe', h1b_known: true },
  { name: 'Cloudflare', board_id: 'cloudflare', h1b_known: true },
  { name: 'Databricks', board_id: 'databricks', h1b_known: true },
  { name: 'Twilio', board_id: 'twilio', h1b_known: true },
  { name: 'Block', board_id: 'block', h1b_known: true },
  { name: 'Plaid', board_id: 'plaid', h1b_known: true },
  { name: 'DoorDash', board_id: 'doordash', h1b_known: true },
  { name: 'Instacart', board_id: 'instacart', h1b_known: true },
  { name: 'Roblox', board_id: 'roblox', h1b_known: true },
  { name: 'Discord', board_id: 'discord', h1b_known: true },
  { name: 'Lyft', board_id: 'lyft', h1b_known: true },
  { name: 'Pinterest', board_id: 'pinterest', h1b_known: true },
  { name: 'Snap', board_id: 'snap', h1b_known: true },
  { name: 'Spotify', board_id: 'spotify', h1b_known: true },

  // Data / Cloud / DevOps
  { name: 'Datadog', board_id: 'datadog', h1b_known: true },
  { name: 'MongoDB', board_id: 'mongodb', h1b_known: true },
  { name: 'HashiCorp', board_id: 'hashicorp', h1b_known: true },
  { name: 'Elastic', board_id: 'elastic', h1b_known: true },
  { name: 'GitLab', board_id: 'gitlab', h1b_known: true },
  { name: 'Confluent', board_id: 'confluent', h1b_known: true },
  { name: 'Snowflake', board_id: 'snowflake', h1b_known: true },

  // Security
  { name: 'CrowdStrike', board_id: 'crowdstrike', h1b_known: true },
  { name: 'Okta', board_id: 'okta', h1b_known: true },
  { name: 'Zscaler', board_id: 'zscaler', h1b_known: true },
  { name: 'SentinelOne', board_id: 'sentinelone', h1b_known: true },

  // Enterprise / SaaS
  { name: 'HubSpot', board_id: 'hubspot', h1b_known: true },
  { name: 'Toast', board_id: 'toast', h1b_known: true },
  { name: 'Airtable', board_id: 'airtable', h1b_known: true },
  { name: 'Canva', board_id: 'canva', h1b_known: true },
  { name: 'Figma', board_id: 'figma', h1b_known: true },
  { name: 'Atlassian', board_id: 'atlassian', h1b_known: true },
  { name: 'Notion', board_id: 'notion', h1b_known: true },
  { name: 'Asana', board_id: 'asana', h1b_known: true },

  // AI / ML
  { name: 'Scale AI', board_id: 'scaleai', h1b_known: true },
  { name: 'Anthropic', board_id: 'anthropic', h1b_known: true },
  { name: 'Cohere', board_id: 'cohere', h1b_known: true },

  // Fintech
  { name: 'Robinhood', board_id: 'robinhood', h1b_known: true },
  { name: 'Chime', board_id: 'chime', h1b_known: true },
  { name: 'Affirm', board_id: 'affirm', h1b_known: true },
  { name: 'Brex', board_id: 'brex', h1b_known: true },

  // Indian IT (major H1B sponsors)
  { name: 'Infosys', board_id: 'infosys', h1b_known: true },
  { name: 'Wipro', board_id: 'wipro', h1b_known: true },
  { name: 'HCLTech', board_id: 'hcltech', h1b_known: true },
];

export const LEVER_COMPANIES = [
  { name: 'Netflix', board_id: 'netflix', h1b_known: true },
  { name: 'Rippling', board_id: 'rippling', h1b_known: true },
  { name: 'Ramp', board_id: 'ramp', h1b_known: true },
  { name: 'Gusto', board_id: 'gusto', h1b_known: true },
  { name: 'Anduril', board_id: 'anduril', h1b_known: true },
  { name: 'Navan', board_id: 'navan', h1b_known: true },
  { name: 'Verkada', board_id: 'verkada', h1b_known: true },
  { name: 'Gemini', board_id: 'gemini', h1b_known: true },
  { name: 'Faire', board_id: 'faire', h1b_known: true },
  { name: 'Zip', board_id: 'zip', h1b_known: true },
  { name: 'Applied Intuition', board_id: 'appliedintuition', h1b_known: true },
  { name: 'Persona', board_id: 'persona', h1b_known: true },
  { name: 'Grammarly', board_id: 'grammarly', h1b_known: true },
  { name: 'Fivetran', board_id: 'fivetran', h1b_known: true },
  { name: 'Lacework', board_id: 'lacework', h1b_known: true },
];

// IT-related department/team keywords to filter jobs
export const IT_DEPARTMENT_KEYWORDS = [
  'engineering', 'software', 'technology', 'data', 'infrastructure',
  'platform', 'security', 'devops', 'cloud', 'product', 'machine learning',
  'artificial intelligence', 'it', 'information technology', 'developer',
  'architect', 'sre', 'reliability', 'backend', 'frontend', 'full stack',
  'mobile', 'qa', 'quality', 'test', 'analytics', 'database', 'network',
  'systems', 'cyber', 'research'
];
