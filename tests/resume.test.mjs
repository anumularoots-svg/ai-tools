// Accuracy tests for the resume pipeline.
// Run: node tests/resume.test.mjs
//
// The defect these guard against: the prompt used to say "estimate realistic
// metrics if none provided", and the validator penalised resumes for having
// too few metrics. Together they made the system invent numbers the candidate
// then had to defend in an interview.
import { validateResume } from '../validator/resume-validator.js';
import { getSystemPrompt, isUSTarget } from '../prompts/prompt-engine.js';

let pass = 0, fail = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         expected ' + JSON.stringify(expected) + '\n         actual   ' + JSON.stringify(actual)); }
}

// A candidate who supplied exactly two numbers: 2,400,000 records and 65%.
const userData = {
  fullName: 'Priya Sharma',
  degree: 'MS Computer Science',
  totalExp: '2',
  experience: [{
    title: 'Data Engineer Intern', company: 'Infosys', start: 'Jun 2024', end: 'May 2025',
    details: 'Built ETL pipelines processing 2,400,000 records daily. Cut reporting time by 65%.'
  }]
};

const base = {
  personal: { fullName: 'Priya Sharma' },
  summary: 'Data engineer with hands-on experience building production ETL pipelines in Python and SQL across cloud platforms today.',
  skills: [{ category: 'Languages', items: ['Python', 'SQL'] }, { category: 'Cloud', items: ['AWS', 'Docker'] }, { category: 'Data', items: ['Spark', 'Airflow'] }],
  education: [{ degree: 'MS Computer Science', institution: 'UT Dallas', year: '2026' }],
  experience: [{ title: 'Data Engineer Intern', company: 'Infosys', bullets: [] }]
};

const withBullets = bullets => ({
  ...base,
  experience: [{ ...base.experience[0], bullets: bullets.map(text => ({ text })) }]
});

console.log('\nfabricated metrics are caught');
let r = validateResume(withBullets([
  'Automated the nightly reconciliation job, reducing manual effort by 40%',
  'Designed a data model serving 15,000 users across three business units',
  'Optimized query performance, cutting runtime by 3x for the reporting layer'
]), userData);
check('all three invented numbers flagged', r.fabricatedMetrics.length, 3);
check('flagged as critical', r.issues.filter(i => i.severity === 'critical').length >= 3, true);
check('score is pushed below passing', r.passed, false);
check('40% identified', r.fabricatedMetrics.some(f => f.value.includes('40')), true);
check('15,000 identified', r.fabricatedMetrics.some(f => f.value.includes('15,000')), true);
check('3x identified', r.fabricatedMetrics.some(f => f.value.toLowerCase().includes('3x')), true);

console.log('\nreal numbers from the candidate are NOT flagged');
r = validateResume(withBullets([
  'Built ETL pipelines in Python processing 2,400,000 records daily for the analytics platform',
  'Reduced reporting turnaround by 65% across three business units using SQL transformations'
]), userData);
check('no false accusations', r.fabricatedMetrics.length, 0);

console.log('\nrephrased-but-sourced numbers are NOT flagged');
r = validateResume(withBullets([
  'Built ETL pipelines processing 2.4M records daily across the analytics platform infrastructure'
]), userData);
check('2.4M accepted when source says 2,400,000', r.fabricatedMetrics.length, 0);

console.log('\nplaceholders are the honest path');
r = validateResume(withBullets([
  'Automated the nightly reconciliation job [ADD METRIC: how many hours per week did this save?]',
  'Migrated the reporting stack to Snowflake [ADD METRIC: how many tables were migrated?]'
]), userData);
check('placeholders counted', r.placeholderCount, 2);
check('placeholders are not treated as fabrication', r.fabricatedMetrics.length, 0);
check('bullets with placeholders still pass', r.passed, true);

console.log('\nno penalty for having few metrics (this is what caused fabrication)');
const noMetrics = validateResume(withBullets([
  'Built and maintained ETL pipelines in Python for the analytics reporting platform',
  'Designed SQL transformations supporting the finance and operations reporting stack',
  'Deployed containerised services to AWS and documented the runbooks for handover'
]), userData);
check('a metric-free resume is not marked down', noMetrics.issues.some(i => /metrics/i.test(i.message) && /only|target/i.test(i.message)), false);
check('a metric-free resume still passes', noMetrics.passed, true);

console.log('\nsummary with an invented number is caught');
r = validateResume({ ...withBullets(['Built ETL pipelines processing 2,400,000 records daily for analytics']),
  summary: 'Data engineer who delivered $2.5M in annual savings across enterprise reporting systems and platforms.' }, userData);
check('summary fabrication flagged', r.fabricatedMetrics.some(f => f.where === 'summary'), true);

console.log('\ndates and years are not treated as claims');
r = validateResume({ ...withBullets(['Built ETL pipelines in Python from 2024 to 2025 for the reporting platform']) }, userData);
check('years not flagged as fabricated metrics', r.fabricatedMetrics.length, 0);

console.log('\nexisting fabrication checks still work');
r = validateResume({ ...withBullets(['Built ETL pipelines processing 2,400,000 records daily for analytics']),
  experience: [{ title: 'Engineer', company: 'Google', bullets: [{ text: 'Built ETL pipelines processing 2,400,000 records daily' }] }] }, userData);
check('invented employer still caught', r.issues.some(i => /fabricated company/i.test(i.message)), true);

console.log('\nUS convention checks');
r = validateResume({ ...withBullets(['Built ETL pipelines processing 2,400,000 records daily for analytics']),
  personal: { fullName: 'Priya Sharma', dateOfBirth: '1999-04-02', maritalStatus: 'Single' } }, userData);
check('date of birth flagged', r.issues.some(i => /dob|dateofbirth/i.test(i.message)), true);
check('marital status flagged', r.issues.some(i => /maritalstatus/i.test(i.message)), true);

console.log('\nsystem prompt wiring');
const usPrompt = getSystemPrompt(2, 'United States');
check('metric rule present', /NEVER estimate, infer, approximate, or invent a number/.test(usPrompt), true);
check('old fabrication instruction gone', /Estimate realistic metrics/.test(usPrompt), false);
check('US conventions applied for US target', /NO photo, NO date of birth/.test(usPrompt), true);
check('US conventions applied when country unset', /NO photo/.test(getSystemPrompt(2)), true);
check('US conventions NOT applied for Germany', /NO photo/.test(getSystemPrompt(2, 'Germany')), false);
check('metric rule still applied for Germany', /NEVER estimate/.test(getSystemPrompt(2, 'Germany')), true);
check('Naukri reference removed', /Naukri/.test(getSystemPrompt(5) + getSystemPrompt(15)), false);
check('isUSTarget defaults to true', isUSTarget(undefined), true);
check('isUSTarget false for India', isUSTarget('India'), false);

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
