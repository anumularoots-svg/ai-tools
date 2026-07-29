// ============================================================================
// ZapKitt — H-1B sample fixture. NOT REAL DOL DATA.
//
// These counts and wages are INVENTED placeholders so the page, the API and the
// tests can be exercised before the real dataset is ingested. They must never
// be presented to a user as fact.
//
// Three guards keep them out of production:
//   1. api/sponsor.js only reads this file when H1B_SAMPLE_DATA=1 is set.
//   2. Every response built from it carries source:"sample".
//   3. The page renders an unmissable banner whenever source === "sample".
//
// Real data comes from scripts/ingest-lca.mjs. Delete nothing here — the tests
// depend on this shape matching db/h1b-schema.sql.
// ============================================================================

export const SAMPLE_EMPLOYERS = [
  {
    employer_key: 'DELOITTE CONSULTING',
    employer_name: 'Deloitte Consulting LLP',
    total_filings: 9100, certified: 8940, denied: 60, withdrawn: 100,
    latest_fy: 2025, latest_fy_certified: 3120,
    fy_counts: { 2023: 2810, 2024: 3010, 2025: 3120 },
    top_states: [{ state: 'TX', certified: 1980 }, { state: 'NY', certified: 1540 }, { state: 'CA', certified: 1120 }],
    wage_p25: 96000, wage_median: 122000, wage_p75: 156000,
    roles: [
      { key: 'CONSULTANT', title: 'Consultant', certified: 2140, wageMedian: 108000 },
      { key: 'DATA ANALYST', title: 'Data Analyst', certified: 640, wageMedian: 94000 },
      { key: 'SOFTWARE ENGINEER', title: 'Software Engineer', certified: 580, wageMedian: 132000 },
      { key: 'BUSINESS ANALYST', title: 'Business Analyst', certified: 410, wageMedian: 91000 }
    ]
  },
  {
    employer_key: 'AMAZON',
    employer_name: 'Amazon.com Services LLC',
    total_filings: 12400, certified: 12210, denied: 70, withdrawn: 120,
    latest_fy: 2025, latest_fy_certified: 4380,
    fy_counts: { 2023: 3760, 2024: 4070, 2025: 4380 },
    top_states: [{ state: 'WA', certified: 5210 }, { state: 'CA', certified: 2410 }, { state: 'NY', certified: 980 }],
    wage_p25: 128000, wage_median: 159000, wage_p75: 198000,
    roles: [
      { key: 'SOFTWARE DEVELOPMENT ENGINEER', title: 'Software Development Engineer', certified: 5120, wageMedian: 168000 },
      { key: 'DATA ENGINEER', title: 'Data Engineer', certified: 890, wageMedian: 152000 },
      { key: 'DATA SCIENTIST', title: 'Data Scientist', certified: 610, wageMedian: 161000 },
      { key: 'PRODUCT MANAGER', title: 'Product Manager', certified: 520, wageMedian: 158000 }
    ]
  },
  {
    employer_key: 'GOOGLE',
    employer_name: 'Google LLC',
    total_filings: 7300, certified: 7240, denied: 20, withdrawn: 40,
    latest_fy: 2025, latest_fy_certified: 2510,
    fy_counts: { 2023: 2310, 2024: 2420, 2025: 2510 },
    top_states: [{ state: 'CA', certified: 4820 }, { state: 'NY', certified: 910 }, { state: 'WA', certified: 640 }],
    wage_p25: 152000, wage_median: 188000, wage_p75: 232000,
    roles: [
      { key: 'SOFTWARE ENGINEER', title: 'Software Engineer', certified: 4610, wageMedian: 194000 },
      { key: 'DATA SCIENTIST', title: 'Data Scientist', certified: 380, wageMedian: 186000 },
      { key: 'PRODUCT MANAGER', title: 'Product Manager', certified: 290, wageMedian: 191000 }
    ]
  },
  {
    employer_key: 'INFOSYS',
    employer_name: 'Infosys Limited',
    total_filings: 15200, certified: 14900, denied: 180, withdrawn: 120,
    latest_fy: 2025, latest_fy_certified: 4720,
    fy_counts: { 2023: 5410, 2024: 4770, 2025: 4720 },
    top_states: [{ state: 'TX', certified: 3110 }, { state: 'NJ', certified: 2240 }, { state: 'CA', certified: 1890 }],
    wage_p25: 82000, wage_median: 98000, wage_p75: 121000,
    roles: [
      { key: 'TECHNOLOGY ANALYST', title: 'Technology Analyst', certified: 4980, wageMedian: 89000 },
      { key: 'SYSTEMS ENGINEER', title: 'Systems Engineer', certified: 2140, wageMedian: 84000 },
      { key: 'DATA ANALYST', title: 'Data Analyst', certified: 720, wageMedian: 92000 }
    ]
  },
  {
    employer_key: 'JPMORGAN CHASE BANK',
    employer_name: 'JPMorgan Chase Bank, N.A.',
    total_filings: 6100, certified: 6020, denied: 40, withdrawn: 40,
    latest_fy: 2025, latest_fy_certified: 2140,
    fy_counts: { 2023: 1880, 2024: 2000, 2025: 2140 },
    top_states: [{ state: 'NY', certified: 2610 }, { state: 'TX', certified: 1240 }, { state: 'IL', certified: 720 }],
    wage_p25: 112000, wage_median: 141000, wage_p75: 178000,
    roles: [
      { key: 'SOFTWARE ENGINEER', title: 'Software Engineer', certified: 2810, wageMedian: 148000 },
      { key: 'QUANTITATIVE ANALYST', title: 'Quantitative Analyst', certified: 490, wageMedian: 165000 },
      { key: 'DATA ANALYST', title: 'Data Analyst', certified: 340, wageMedian: 106000 }
    ]
  },
  {
    employer_key: 'STARBUCKS',
    employer_name: 'Starbucks Corporation',
    total_filings: 210, certified: 204, denied: 3, withdrawn: 3,
    latest_fy: 2025, latest_fy_certified: 62,
    fy_counts: { 2023: 78, 2024: 64, 2025: 62 },
    top_states: [{ state: 'WA', certified: 178 }, { state: 'CA', certified: 14 }],
    wage_p25: 104000, wage_median: 129000, wage_p75: 158000,
    roles: [
      { key: 'SOFTWARE ENGINEER', title: 'Software Engineer', certified: 74, wageMedian: 141000 },
      { key: 'DATA ANALYST', title: 'Data Analyst', certified: 31, wageMedian: 112000 }
    ]
  },
  {
    // Deliberately included: the "occasional sponsor" tier needs a fixture.
    employer_key: 'RIVERBEND ANALYTICS GROUP',
    employer_name: 'Riverbend Analytics Group',
    total_filings: 11, certified: 9, denied: 1, withdrawn: 1,
    latest_fy: 2025, latest_fy_certified: 3,
    fy_counts: { 2023: 2, 2024: 4, 2025: 3 },
    top_states: [{ state: 'IL', certified: 9 }],
    wage_p25: 78000, wage_median: 86000, wage_p75: 97000,
    roles: [
      { key: 'DATA ANALYST', title: 'Data Analyst', certified: 6, wageMedian: 84000 },
      { key: 'BUSINESS ANALYST', title: 'Business Analyst', certified: 3, wageMedian: 89000 }
    ]
  },
  {
    // Deliberately included: the "stopped filing" tier needs a fixture.
    employer_key: 'HALCYON RETAIL SYSTEMS',
    employer_name: 'Halcyon Retail Systems',
    total_filings: 46, certified: 44, denied: 1, withdrawn: 1,
    // latest_fy is the DATASET's most recent year (2025), and they filed
    // nothing in it — which is exactly what puts them in the dormant tier.
    latest_fy: 2025, latest_fy_certified: 0,
    fy_counts: { 2023: 44 },
    top_states: [{ state: 'OH', certified: 44 }],
    wage_p25: 71000, wage_median: 83000, wage_p75: 94000,
    roles: [
      { key: 'SOFTWARE ENGINEER', title: 'Software Engineer', certified: 28, wageMedian: 88000 }
    ]
  }
];
