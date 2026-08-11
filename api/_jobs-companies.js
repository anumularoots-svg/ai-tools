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

  // Fintech
  { name: 'Robinhood', board_id: 'robinhood', h1b_known: true, country: 'US' },
  { name: 'Chime', board_id: 'chime', h1b_known: true, country: 'US' },
  { name: 'Affirm', board_id: 'affirm', h1b_known: true, country: 'US' },
  { name: 'Brex', board_id: 'brex', h1b_known: true, country: 'US' },

  // Indian IT (major H1B sponsors — also have India offices for freshers)
  { name: 'Infosys', board_id: 'infosys', h1b_known: true, country: 'BOTH' },
  { name: 'Wipro', board_id: 'wipro', h1b_known: true, country: 'BOTH' },
  { name: 'HCLTech', board_id: 'hcltech', h1b_known: true, country: 'BOTH' },
];

// ── India tech companies for fresher dashboard ───────────────────────────────
export const INDIA_GREENHOUSE_COMPANIES = [
  // Global companies with strong India presence (fresher hiring)
  { name: 'Freshworks', board_id: 'freshworks', fresher: true },
  { name: 'Razorpay', board_id: 'razorpay', fresher: true },
  { name: 'Swiggy', board_id: 'swiggy', fresher: true },
  { name: 'PhonePe', board_id: 'phonepe', fresher: true },
  { name: 'Meesho', board_id: 'meesho', fresher: true },
  { name: 'CRED', board_id: 'cred', fresher: true },
  { name: 'Groww', board_id: 'groww', fresher: true },
  { name: 'Zepto', board_id: 'zepto', fresher: true },
  { name: 'Ola', board_id: 'ola', fresher: true },
  { name: 'Zomato', board_id: 'zomato', fresher: true },
  { name: 'Paytm', board_id: 'paytm', fresher: true },
  { name: 'Flipkart', board_id: 'flipkart', fresher: true },
  { name: 'Byju\'s', board_id: 'byjus', fresher: true },
  { name: 'Nykaa', board_id: 'nykaa', fresher: true },
  { name: 'Urban Company', board_id: 'urbancompany', fresher: true },
  { name: 'Dream11', board_id: 'dream11', fresher: true },
  { name: 'MPL', board_id: 'mpl', fresher: true },
  { name: 'Postman', board_id: 'postman', fresher: true },
  { name: 'BrowserStack', board_id: 'browserstack', fresher: true },
  { name: 'Hasura', board_id: 'hasura', fresher: true },
  { name: 'Chargebee', board_id: 'chargebee', fresher: true },
  { name: 'Clevertap', board_id: 'clevertap', fresher: true },
  { name: 'Darwinbox', board_id: 'darwinbox', fresher: true },
  { name: 'Leadsquared', board_id: 'leadsquared', fresher: true },
  { name: 'Moengage', board_id: 'moengage', fresher: true },
  // MNC India offices
  { name: 'Infosys', board_id: 'infosys', fresher: true },
  { name: 'Wipro', board_id: 'wipro', fresher: true },
  { name: 'HCLTech', board_id: 'hcltech', fresher: true },
  { name: 'Capgemini', board_id: 'capgemini', fresher: true },
  { name: 'Accenture', board_id: 'accenture', fresher: true },
  { name: 'Cognizant', board_id: 'cognizant', fresher: true },
  { name: 'LTIMindtree', board_id: 'ltimindtree', fresher: true },
  { name: 'Mphasis', board_id: 'mphasis', fresher: true },
  { name: 'Hexaware', board_id: 'hexaware', fresher: true },
  { name: 'Persistent', board_id: 'persistent', fresher: true },
];

export const LEVER_COMPANIES = [
  { name: 'Netflix', board_id: 'netflix', h1b_known: true, country: 'US' },
  { name: 'Rippling', board_id: 'rippling', h1b_known: true, country: 'US' },
  { name: 'Ramp', board_id: 'ramp', h1b_known: true, country: 'US' },
  { name: 'Gusto', board_id: 'gusto', h1b_known: true, country: 'US' },
  { name: 'Anduril', board_id: 'anduril', h1b_known: true, country: 'US' },
  { name: 'Navan', board_id: 'navan', h1b_known: true, country: 'US' },
  { name: 'Verkada', board_id: 'verkada', h1b_known: true, country: 'US' },
  { name: 'Gemini', board_id: 'gemini', h1b_known: true, country: 'US' },
  { name: 'Faire', board_id: 'faire', h1b_known: true, country: 'US' },
  { name: 'Zip', board_id: 'zip', h1b_known: true, country: 'US' },
  { name: 'Applied Intuition', board_id: 'appliedintuition', h1b_known: true, country: 'US' },
  { name: 'Persona', board_id: 'persona', h1b_known: true, country: 'US' },
  { name: 'Grammarly', board_id: 'grammarly', h1b_known: true, country: 'US' },
  { name: 'Fivetran', board_id: 'fivetran', h1b_known: true, country: 'US' },
  { name: 'Lacework', board_id: 'lacework', h1b_known: true, country: 'US' },
];

// IT-related department/team keywords to filter jobs
export const IT_DEPARTMENT_KEYWORDS = [
  'engineering', 'software', 'technology', 'data', 'infrastructure',
  'platform', 'security', 'devops', 'cloud', 'product', 'machine learning',
  'artificial intelligence', 'it', 'information technology', 'developer',
  'architect', 'sre', 'reliability', 'backend', 'frontend', 'full stack',
  'mobile', 'qa', 'quality', 'test', 'analytics', 'database', 'network',
  'systems', 'cyber', 'research', 'intern', 'trainee', 'fresher', 'graduate'
];

// Fresher/entry level keywords
export const FRESHER_KEYWORDS = [
  'fresher', 'fresh graduate', 'entry level', 'junior', 'trainee',
  'graduate trainee', 'campus', 'intern', 'associate engineer',
  '0-1 year', '0-2 year', '0 year', 'no experience', 'recent graduate',
  'new grad', 'graduate engineer'
];
