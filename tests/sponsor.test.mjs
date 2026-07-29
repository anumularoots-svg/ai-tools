// Accuracy tests for the H-1B sponsor lookup's deterministic core.
// Run: node tests/sponsor.test.mjs
//
// The whole product claim is "these are real counts from DOL data, not a model
// guessing". That claim rests on three things being right: employer names
// collapsing to one key, wages annualising correctly, and the verdict tiers
// keying off the DATASET's latest fiscal year rather than each employer's own.
import {
  normalizeEmployer, normalizeRole, annualizeWage, fiscalYear,
  percentile, titleCase, pickDisplayName, verdict, buildResult
} from '../api/_h1b.js';
import { splitCsvLine, mapColumns } from '../scripts/ingest-lca.mjs';
import { SAMPLE_EMPLOYERS } from '../api/_h1b-sample.js';

let pass = 0, fail = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         expected ' + JSON.stringify(expected) + '\n         actual   ' + JSON.stringify(actual)); }
}

console.log('\nemployer name normalisation (one company must be one row)');
check('Inc suffix stripped', normalizeEmployer('Acme Systems, Inc.'), 'ACME SYSTEMS');
check('LLC with dots stripped', normalizeEmployer('Acme Systems L.L.C.'), 'ACME SYSTEMS');
check('all spellings of one company collapse',
  [...new Set(['AMAZON.COM SERVICES LLC', 'Amazon.com Services, Inc.', 'AMAZON COM SERVICES  L.L.C.'].map(normalizeEmployer))],
  ['AMAZON COM SERVICES']);
check('ampersand becomes AND', normalizeEmployer('Johnson & Johnson'), 'JOHNSON AND JOHNSON');
check('leading The dropped', normalizeEmployer('The Boeing Company'), 'BOEING');
check('stacked suffixes stripped', normalizeEmployer('Globex Technologies USA Inc'), 'GLOBEX TECHNOLOGIES');
check('accents folded', normalizeEmployer('Sanofi-Aventis Amérique'), 'SANOFI AVENTIS AMERIQUE');
check('a name that is only a suffix is not emptied', normalizeEmployer('US Corp'), 'US');
check('empty input is safe', normalizeEmployer(''), '');
check('null input is safe', normalizeEmployer(null), '');
check('distinct companies stay distinct',
  normalizeEmployer('Apple Inc') === normalizeEmployer('Applebees Inc'), false);

console.log('\nrole normalisation');
check('seniority stripped', normalizeRole('Sr. Software Engineer'), 'SOFTWARE ENGINEER');
check('roman numeral level stripped', normalizeRole('Software Engineer II'), 'SOFTWARE ENGINEER');
check('IV is a level, not I + V', normalizeRole('Data Analyst IV'), 'DATA ANALYST');
check('parenthetical team stripped', normalizeRole('Software Engineer (Payments)'), 'SOFTWARE ENGINEER');
check('numeric level stripped', normalizeRole('Engineer Level 3'), 'ENGINEER');
check('title with no noise is unchanged', normalizeRole('Data Scientist'), 'DATA SCIENTIST');
check('empty title is safe', normalizeRole(''), '');

console.log('\nwage annualisation');
check('yearly passes through', annualizeWage('145000', 'Year'), 145000);
check('hourly x2080', annualizeWage('72.50', 'Hour'), 150800);
check('monthly x12', annualizeWage('9000', 'Month'), 108000);
check('weekly x52', annualizeWage('2500', 'Week'), 130000);
check('bi-weekly x26', annualizeWage('5000', 'Bi-Weekly'), 130000);
check('currency symbols and commas tolerated', annualizeWage('$120,000.00', 'Year'), 120000);
check('unit is case-insensitive', annualizeWage('100000', 'YEAR'), 100000);
// This is the row that silently wrecks a median: a salary tagged as an hourly
// rate annualises to $312M. Reject rather than ingest.
check('salary mislabelled as hourly is rejected', annualizeWage('150000', 'Hour'), null);
check('implausibly low wage rejected', annualizeWage('5', 'Year'), null);
check('unknown unit rejected', annualizeWage('100000', 'Fortnight'), null);
check('blank wage rejected', annualizeWage('', 'Year'), null);
check('zero rejected', annualizeWage('0', 'Year'), null);

console.log('\nfiscal year (federal FY runs Oct 1 - Sep 30)');
check('September 30 is the old FY', fiscalYear('2025-09-30'), 2025);
check('October 1 rolls to the next FY', fiscalYear('2024-10-01'), 2025);
check('September 30 of the prior year', fiscalYear('2024-09-30'), 2024);
check('mid-year date', fiscalYear('2025-03-14'), 2025);
check('unparseable date is null', fiscalYear('not a date'), null);
check('empty date is null', fiscalYear(''), null);

console.log('\npercentiles');
check('median of an odd-length set', percentile([10, 20, 30], 0.5), 20);
check('median of an even-length set interpolates', percentile([10, 20, 30, 40], 0.5), 25);
check('p25', percentile([100, 200, 300, 400, 500], 0.25), 200);
check('empty set is null', percentile([], 0.5), null);

console.log('\ndisplay names');
check('SHOUTING is title-cased', titleCase('DELOITTE CONSULTING LLP'), 'Deloitte Consulting LLP');
check('acronyms preserved', titleCase('IBM CORPORATION'), 'IBM Corporation');
check('mixed case is left alone', titleCase('JPMorgan Chase Bank'), 'JPMorgan Chase Bank');
check('most frequent spelling wins',
  pickDisplayName({ 'ACME INC': 9, 'Acme Incorporated': 2 }), 'Acme Inc');

console.log('\nCSV parsing (job titles contain commas)');
check('plain row', splitCsvLine('a,b,c'), ['a', 'b', 'c']);
check('quoted field containing a comma stays one field',
  splitCsvLine('ACME INC,"Engineer, Senior",CERTIFIED'), ['ACME INC', 'Engineer, Senior', 'CERTIFIED']);
check('escaped double quote', splitCsvLine('a,"say ""hi""",c'), ['a', 'say "hi"', 'c']);
check('trailing empty field is kept', splitCsvLine('a,b,'), ['a', 'b', '']);
check('empty middle field is kept', splitCsvLine('a,,c'), ['a', '', 'c']);

console.log('\ncolumn mapping across DOL file formats');
const modern = mapColumns(['CASE_NUMBER', 'CASE_STATUS', 'VISA_CLASS', 'EMPLOYER_NAME', 'JOB_TITLE', 'DECISION_DATE', 'WAGE_RATE_OF_PAY_FROM', 'WAGE_UNIT_OF_PAY', 'WORKSITE_STATE']);
check('modern header maps employer', modern.employer, 3);
check('modern header maps status', modern.status, 1);
check('modern header maps wage unit', modern.wageUnit, 7);
const legacy = mapColumns(['LCA_CASE_NUMBER', 'STATUS', 'LCA_CASE_EMPLOYER_NAME', 'LCA_CASE_JOB_TITLE', 'LCA_CASE_SUBMIT']);
check('legacy header maps employer', legacy.employer, 2);
check('legacy header maps status', legacy.status, 1);
check('missing column reports -1', legacy.wage, -1);
check('lowercase / spaced headers still map',
  mapColumns(['case status', 'Employer Name']).employer, 1);

console.log('\nverdict tiers (keyed off the DATASET latest FY, not the employer)');
check('high volume is a strong sponsor',
  verdict({ found: true, recentCertified: 3120, totalCertified: 8940, yearsWithFilings: 3 }).tier, 'strong');
check('steady volume is an active sponsor',
  verdict({ found: true, recentCertified: 62, totalCertified: 204, yearsWithFilings: 3 }).tier, 'active');
check('a handful is occasional',
  verdict({ found: true, recentCertified: 3, totalCertified: 9, yearsWithFilings: 3 }).tier, 'occasional');
// The bug this guards: an employer with 44 filings in FY2023 and none since
// must not read as an active sponsor just because 2023 was their latest year.
check('history but nothing in the latest FY is dormant',
  verdict({ found: true, recentCertified: 0, totalCertified: 44, yearsWithFilings: 1 }).tier, 'dormant');
check('no record at all is unknown, not "does not sponsor"',
  verdict({ found: false }).tier, 'unknown');
check('unknown does not claim the company refuses to sponsor',
  /different name|parent company/.test(verdict({ found: false }).detail), true);
check('boundary: 20 is active', verdict({ found: true, recentCertified: 20, totalCertified: 20 }).tier, 'active');
check('boundary: 19 is occasional', verdict({ found: true, recentCertified: 19, totalCertified: 19 }).tier, 'occasional');
check('boundary: 100 is strong', verdict({ found: true, recentCertified: 100, totalCertified: 100 }).tier, 'strong');

console.log('\nbuildResult payload');
const strong = buildResult(SAMPLE_EMPLOYERS.find(e => e.employer_key === 'DELOITTE CONSULTING'), { query: 'deloitte', source: 'sample' });
check('found flag set', strong.found, true);
check('source is carried through so the UI can warn', strong.source, 'sample');
check('fiscal years are ascending', strong.stats.yearsCovered, [2023, 2024, 2025]);
check('fy series is chart-ready', strong.stats.fyCounts.map(f => f.certified), [2810, 3010, 3120]);
check('verdict computed from the row', strong.verdict.tier, 'strong');
check('a normal denial share is not flagged', strong.stats.denialFlag, null);
check('roles passed through', strong.roles.length > 0, true);

const dormant = buildResult(SAMPLE_EMPLOYERS.find(e => e.employer_key === 'HALCYON RETAIL SYSTEMS'), { query: 'halcyon', source: 'sample' });
check('employer that stopped filing reads as dormant', dormant.verdict.tier, 'dormant');
check('dormant employer shows 0 for the latest FY', dormant.stats.latestFyCertified, 0);
// The chart must show the gap. Plotting only the years they filed in draws one
// confident bar for a company that has not filed in two years.
check('dormant series is filled through the dataset latest FY',
  dormant.stats.fyCounts, [{ fy: 2023, certified: 44 }, { fy: 2024, certified: 0 }, { fy: 2025, certified: 0 }]);
check('dormant total is unchanged by the fill', dormant.stats.totalCertified, 44);

const missing = buildResult(null, { query: 'nonexistent co', source: 'sample' });
check('missing employer is not found', missing.found, false);
check('missing employer still gets a verdict', missing.verdict.tier, 'unknown');
check('missing employer echoes the query', missing.query, 'nonexistent co');

console.log('\nsample fixture matches the schema the API expects');
const REQUIRED = ['employer_key', 'employer_name', 'total_filings', 'certified', 'latest_fy', 'latest_fy_certified', 'fy_counts', 'top_states', 'roles'];
check('every sample row has every column',
  SAMPLE_EMPLOYERS.every(r => REQUIRED.every(k => r[k] !== undefined)), true);
check('sample keys are normalised the same way the ingest normalises',
  SAMPLE_EMPLOYERS.every(r => r.employer_key === normalizeEmployer(r.employer_key)), true);
check('certified never exceeds total filings',
  SAMPLE_EMPLOYERS.every(r => r.certified <= r.total_filings), true);
check('every sample row shares one dataset latest FY',
  [...new Set(SAMPLE_EMPLOYERS.map(r => r.latest_fy))], [2025]);

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
