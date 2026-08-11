// ============================================================================
// ZapKitt Jobs V1 — H1B-sponsoring tech companies (Greenhouse + Lever)
// + India tech companies for fresher dashboard
// ============================================================================

export const GREENHOUSE_COMPANIES = [
  // Big Tech / Major US H1B Sponsors
  { name: 'Airbnb', board_id: 'airbnb', h1b_known: true, country: 'US' },
  { name: 'Coinbase', board_id: 'coinbase', h1b_known: true, country: 'US' },
  { name: 'Stripe', board_id: 'stripe', h1b_known: true, country: 'US' },
  { name: 'Cloudflare', board_id: 'cloudflare', h1b_known: true, country: 'US' },
  { name: 'Databricks', board_id: 'databricks', h1b_known: true, country: 'US' },
  { name: 'Twilio', board_id: 'twilio', h1b_known: true, country: 'US' },
  { name: 'Block', board_id: 'block', h1b_known: true, country: 'US' },
  { name: 'Plaid', board_id: 'plaid', h1b_known: true, country: 'US' },
  { name: 'DoorDash', board_id: 'doordash', h1b_known: true, country: 'US' },
  { name: 'Instacart', board_id: 'instacart', h1b_known: true, country: 'US' },
  { name: 'Roblox', board_id: 'roblox', h1b_known: true, country: 'US' },
  { name: 'Discord', board_id: 'discord', h1b_known: true, country: 'US' },
  { name: 'Lyft', board_id: 'lyft', h1b_known: true, country: 'US' },
  { name: 'Pinterest', board_id: 'pinterest', h1b_known: true, country: 'US' },
  { name: 'Snap', board_id: 'snap', h1b_known: true, country: 'US' },
  { name: 'Spotify', board_id: 'spotify', h1b_known: true, country: 'US' },

  // Data / Cloud / DevOps
  { name: 'Datadog', board_id: 'datadog', h1b_known: true, country: 'US' },
  { name: 'MongoDB', board_id: 'mongodb', h1b_known: true, country: 'US' },
  { name: 'HashiCorp', board_id: 'hashicorp', h1b_known: true, country: 'US' },
  { name: 'Elastic', board_id: 'elastic', h1b_known: true, country: 'US' },
  { name: 'GitLab', board_id: 'gitlab', h1b_known: true, country: 'US' },
  { name: 'Confluent', board_id: 'confluent', h1b_known: true, country: 'US' },
  { name: 'Snowflake', board_id: 'snowflake', h1b_known: true, country: 'US' },

  // Security
  { name: 'CrowdStrike', board_id: 'crowdstrike', h1b_known: true, country: 'US' },
  { name: 'Okta', board_id: 'okta', h1b_known: true, country: 'US' },
  { name: 'Zscaler', board_id: 'zscaler', h1b_known: true, country: 'US' },
  { name: 'SentinelOne', board_id: 'sentinelone', h1b_known: true, country: 'US' },

  // Enterprise / SaaS
  { name: 'HubSpot', board_id: 'hubspot', h1b_known: true, country: 'US' },
  { name: 'Toast', board_id: 'toast', h1b_known: true, country: 'US' },
  { name: 'Airtable', board_id: 'airtable', h1b_known: true, country: 'US' },
  { name: 'Canva', board_id: 'canva', h1b_known: true, country: 'US' },
  { name: 'Figma', board_id: 'figma', h1b_known: true, country: 'US' },
  { name: 'Atlassian', board_id: 'atlassian', h1b_known: true, country: 'US' },
  { name: 'Notion', board_id: 'notion', h1b_known: true, country: 'US' },
  { name: 'Asana', board_id: 'asana', h1b_known: true, country: 'US' },

  // AI / ML
  { name: 'Scale AI', board_id: 'scaleai', h1b_known: true, country: 'US' },
  { name: 'Anthropic', board_id: 'anthropic', h1b_known: true, country: 'US' },
  { name: 'Cohere', board_id: 'cohere', h1b_known: true, country: 'US' },
  { name: 'Mistral AI', board_id: 'mistral', h1b_known: true, country: 'US' },
  { name: 'Perplexity', board_id: 'perplexityai', h1b_known: true, country: 'US' },
  { name: 'Hugging Face', board_id: 'huggingface', h1b_known: true, country: 'US' },

  // Fintech
  { name: 'Robinhood', board_id: 'robinhood', h1b_known: true, country: 'US' },
  { name: 'Chime', board_id: 'chime', h1b_known: true, country: 'US' },
  { name: 'Affirm', board_id: 'affirm', h1b_known: true, country: 'US' },
  { name: 'Brex', board_id: 'brex', h1b_known: true, country: 'US' },
  { name: 'Mercury', board_id: 'mercury', h1b_known: true, country: 'US' },
  { name: 'Marqeta', board_id: 'marqeta', h1b_known: true, country: 'US' },

  // Indian IT (major H1B sponsors — also have India offices for freshers)
  { name: 'Infosys', board_id: 'infosys', h1b_known: true, country: 'BOTH' },
  { name: 'Wipro', board_id: 'wipro', h1b_known: true, country: 'BOTH' },
  { name: 'HCLTech', board_id: 'hcltech', h1b_known: true, country: 'BOTH' },

  // Additional tech companies
  { name: 'Wix', board_id: 'wix', h1b_known: true, country: 'US' },
  { name: 'monday.com', board_id: 'mondaycom', h1b_known: true, country: 'US' },
  { name: 'JFrog', board_id: 'jfrog', h1b_known: true, country: 'US' },
  { name: 'Grafana Labs', board_id: 'grafanalabs', h1b_known: true, country: 'US' },
  { name: 'Weights & Biases', board_id: 'wandb', h1b_known: true, country: 'US' },
  { name: 'Retool', board_id: 'retool', h1b_known: true, country: 'US' },
  { name: 'Linear', board_id: 'linear', h1b_known: true, country: 'US' },
  { name: 'Vercel', board_id: 'vercel', h1b_known: true, country: 'US' },
  { name: 'Supabase', board_id: 'supabase', h1b_known: true, country: 'US' },
];

export const LEVER_COMPANIES = [
  { name: 'Netflix', board_id: 'netflix', h1b_known: true, country: 'US' },
  { name: 'Rippling', board_id: 'rippling', h1b_known: true, country: 'US' },
  { name: 'Ramp', board_id: 'ramp', h1b_known: true, country: 'US' },
  { name: 'Gusto', board_id: 'gusto', h1b_known: true, country: 'US' },
  { name: 'Anduril', board_id: 'anduril', h1b_known: true, country: 'US' },
  { name: 'Navan', board_id: 'navan', h1b_known: true, country: 'US' },
  { name: 'Verkada', board_id: 'verkada', h1b_known: true, country: 'US' },
  { name: 'Faire', board_id: 'faire', h1b_known: true, country: 'US' },
  { name: 'Grammarly', board_id: 'grammarly', h1b_known: true, country: 'US' },
  { name: 'Fivetran', board_id: 'fivetran', h1b_known: true, country: 'US' },
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
