// The 12 ABSOLUTE RULES, enforced deterministically.
// Run: node tests/us-rules.test.mjs
//
// These cover the failures listed in the 100% Fix Guide: visible [ADD METRIC]
// placeholders, two pages for a four-year candidate, duplicate achievement
// sections, an eight-line summary, employer-internal certifications, and the
// Project Portfolio / Additional Information sections.
import {
  sanitizeResumeJSON, sanitizeResumeText, tidyText, trimSummary,
  isUsableBullet, isWorthKeepingCert
} from '../validator/us-resume-rules.js';
import { targetPagesFor } from '../renderer/fit.js';

let pass = 0, fail = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         expected ' + JSON.stringify(expected) + '\n         actual   ' + JSON.stringify(actual)); }
}
const json = (o) => JSON.stringify(o);

// Walk every STRING VALUE in the document. Testing the serialized JSON with
// /\[.*\]/ was wrong: it matches JSON's own array brackets, so it reported a
// placeholder in every resume that had a skills list.
function anyPlaceholder(node) {
  if (typeof node === 'string') return /\[[^\]]*\]/.test(node);
  if (Array.isArray(node)) return node.some(anyPlaceholder);
  if (node && typeof node === 'object') return Object.values(node).some(anyPlaceholder);
  return false;
}

console.log('\nRULE 2 — no bracketed placeholder ever reaches the page');
check('the exact failure from the guide is repaired',
  tidyText('Improved test coverage by [ADD METRIC: what percentage?]'),
  'Improved test coverage');
check('[INSERT NUMBER] is stripped', tidyText('Led a team of [INSERT NUMBER] engineers'), 'Led a team of [INSERT NUMBER] engineers'.replace(/\[[^\]]*\]/, '').replace(/\s{2,}/g, ' ').trim());
check('[X%] is stripped', /\[/.test(tidyText('Cut costs by [X%]')), false);
check('a real metric survives untouched',
  tidyText('Reduced regression time by 60%'), 'Reduced regression time by 60%');
check('a placeholder-only bullet is unusable', isUsableBullet('[ADD METRIC: how many?]'), false);
check('a real bullet is usable', isUsableBullet('Automated 250+ regression test cases in WebdriverIO'), true);

console.log('\nRULE 1 — one page under ten years');
check('1.5 years -> 1 page', targetPagesFor(1.5), 1);
check('4 years -> 1 page (was 2, the reported bug)', targetPagesFor(4), 1);
check('8 years -> 1 page', targetPagesFor(8), 1);
check('10 years -> 2 pages', targetPagesFor(10), 2);

console.log('\nRULE 4 — three-sentence summary');
const long8 = 'Senior Automation Engineer with 4+ years of QA experience. Skilled in WebdriverIO and Appium. ' +
  'Delivered 60% faster regression. Builds Page Object frameworks. Works across web and mobile. ' +
  'Integrates Jenkins pipelines. Performs SQL validation. Communicates with stakeholders.';
check('eight sentences become three', trimSummary(long8).split(/[.!?]+\s/).filter(Boolean).length <= 3, true);
check('a three-sentence summary is untouched',
  trimSummary('A. B. C.').replace(/\s+/g, ' '), 'A. B. C.');

// Periods that do not end a sentence. Splitting at the decimal point threw
// away the first half of the summary — "Software Developer with 1.5 years..."
// became "5 years...".
check('a decimal does not truncate the summary',
  trimSummary('Software Developer with 1.5 years of experience. Skilled in React. Delivered a checkout flow.'),
  'Software Developer with 1.5 years of experience. Skilled in React. Delivered a checkout flow.');
check('a percentage with a decimal survives',
  trimSummary('Maintained 99.9% uptime across the platform.'),
  'Maintained 99.9% uptime across the platform.');
check('a degree abbreviation survives',
  trimSummary('B.S. in Computer Science from UT Austin.'),
  'B.S. in Computer Science from UT Austin.');

console.log('\nRULE 7 — certifications');
check('Infosys internal cert is dropped', isWorthKeepingCert('Infosys Certified Automation Testing Professional'), false);
check('TCS internal cert is dropped', isWorthKeepingCert('TCS Certified Java Developer'), false);
check('AWS is kept', isWorthKeepingCert('AWS Certified Solutions Architect'), true);
check('PMP is kept', isWorthKeepingCert('PMP'), true);
check('ISTQB is kept', isWorthKeepingCert('ISTQB Foundation Level'), true);
check('an unknown issuer is kept rather than silently cut', isWorthKeepingCert('Certified Kubernetes Administrator'), true);

// ── The candidate from the guide ───────────────────────────────────────────
const NAYAK = {
  personal: { fullName: 'Nayak Sudharshan', title: 'Senior Automation Engineer',
    email: 'n@example.com', phone: '+91 9515358589', location: 'Hyderabad, India' },
  summary: long8,
  highlights: ['4+ Yrs QA', '60% Faster Regression'],
  achievements: [
    { text: 'Reduced regression time by 60%' },
    { text: 'Improved test coverage by [ADD METRIC: what percentage?]' },
    { text: 'Automated 250+ test cases' },
    { text: 'Managed 500+ defects' },
  ],
  quantifiedAchievements: ['60% faster regression', 'Reduced regression time by 60%', '250+ automated test cases'],
  skills: [{ category: 'Languages', items: ['JavaScript', 'TypeScript'] }],
  coreCompetencies: ['Automation Testing', 'WebdriverIO'],
  strengths: ['Team Player'],
  experience: [{
    title: 'Senior Automation Engineer', company: 'Infosys Ltd',
    startDate: 'Apr 2022', endDate: 'Present',
    bullets: [
      { text: 'Designed a WebdriverIO framework reducing maintenance effort by 40%' },
      { text: 'Built Appium mobile automation across emulators and real devices' },
      { text: 'Implemented a cross-platform suite covering 250+ automated test cases' },
      { text: 'Developed BDD automation with Cucumber increasing coverage by 50%' },
      { text: 'Integrated Jenkins and GitHub Actions pipelines with Allure reporting' },
      { text: 'Automated REST API testing with Postman and REST Assured' },
      { text: 'Performed exploratory testing and authored RTM from BRDs' },
      { text: 'Executed SQL validation with [ADD METRIC: how many tables?]' },
    ],
  }],
  projectPortfolio: [{ client: 'American Express', project: 'FS Automation' }],
  certifications: [
    { name: 'Infosys Certified Automation Testing Professional' },
    { name: 'Infosys Certified Applied Generative AI Professional' },
    { name: 'AWS Certified Developer' },
  ],
  additionalInfo: { currentLocation: 'Hyderabad, India' },
  education: [{ degree: 'B.Tech', institution: 'JNTU', year: '2018' }],
};

console.log('\nTest 2 — the Nayak profile from the guide (4 years, mid-level)');
const { resume: N, removed } = sanitizeResumeJSON(NAYAK, {
  targetPages: 1, maxBulletsPerRole: 5, maxSummarySentences: 3, dropNonUSLocation: true
});
check('no bracketed placeholder survives anywhere', anyPlaceholder(N), false);
check('Quantified Achievements section is gone', N.quantifiedAchievements, undefined);
check('Project Portfolio is gone', N.projectPortfolio, undefined);
check('Additional Information is gone', N.additionalInfo, undefined);
check('Core Competencies is gone (Skills covers it)', N.coreCompetencies, undefined);
check('bullets capped at 5', N.experience[0].bullets.length, 5);
check('the placeholder-only bullet was dropped, not truncated',
  N.experience[0].bullets.some(b => /SQL validation/.test(b.text)), false);
check('summary is 3 sentences', N.summary.split(/[.!?]+\s/).filter(Boolean).length <= 3, true);
check('only the industry certification remains', N.certifications.map(c => c.name), ['AWS Certified Developer']);
check('duplicate "60% regression" claim appears once',
  (json(N).match(/[Rr]educed regression time by 60%/g) || []).length, 1);
check('non-US location removed from the header for a US target', N.personal.location, '');
check('education survives', N.education.length, 1);
check('the removals are reported, not silent', removed.length > 0, true);

console.log('\nTest 1 — junior candidate (1.5 years)');
const JUNIOR = {
  personal: { fullName: 'Asha Rao', location: 'Austin, TX' },
  summary: 'Software Developer with 1.5 years of experience. Skilled in JavaScript, React and Node.js. Delivered a checkout flow used daily.',
  skills: [{ category: 'Languages', items: ['JavaScript', 'React', 'Node.js'] }],
  experience: [{ title: 'Software Developer', company: 'Acme', bullets: [
    { text: 'Built a React checkout flow handling 2,000 daily transactions' },
    { text: 'Reduced API latency by [ADD METRIC: how much?]' },
    { text: 'Migrated the build pipeline from Jenkins to GitHub Actions' },
    { text: 'Wrote integration tests covering the payment module' },
  ] }],
  education: [{ degree: 'B.S. Computer Science', institution: 'UT Austin', year: '2023' }],
};
const J = sanitizeResumeJSON(JUNIOR, { targetPages: 1, maxBulletsPerRole: 5, dropNonUSLocation: true }).resume;
check('target is 1 page', targetPagesFor(1.5), 1);
check('no placeholders', anyPlaceholder(J), false);
check('placeholder bullet dropped, 3 real ones kept', J.experience[0].bullets.length, 3);
check('a US location is NOT stripped', J.personal.location, 'Austin, TX');
check('no duplicate achievement section', J.quantifiedAchievements, undefined);

console.log('\nTest 3 — senior candidate (8 years, 3 companies)');
const SENIOR = {
  personal: { fullName: 'Ravi K' },
  summary: 'Senior Data Engineer with 8 years of experience in distributed data platforms. Skilled in Python, AWS, Spark and Kafka. Delivered a pipeline processing 4TB daily.',
  skills: [{ category: 'Data', items: ['Python', 'AWS', 'Spark', 'Kafka'] }],
  experience: [0, 1, 2].map(i => ({
    title: 'Data Engineer ' + i, company: 'Company ' + i,
    bullets: Array.from({ length: 8 }, (_, k) => ({ text: 'Engineered a Spark job number ' + k + ' processing terabytes of event data daily' })),
  })),
  additionalInfo: { currentLocation: 'Pune, India' },
  education: [{ degree: 'M.S. Data Science', institution: 'BITS', year: '2016' }],
};
const S8 = sanitizeResumeJSON(SENIOR, { targetPages: 1, maxBulletsPerRole: 5 }).resume;
check('8 years is still a 1-page target', targetPagesFor(8), 1);
// RULE 6 tapers: 5 on the current role, 4 on the previous, 3 on anything older.
// A flat cap gave 5+5+5, which reads as three current jobs.
check('bullets taper across roles', S8.experience.map(e => e.bullets.length), [5, 4, 3]);
check('Additional Information with only a location is gone', S8.additionalInfo, undefined);

console.log('\nTest 4 — fresher (0 years)');
const FRESHER = {
  personal: { fullName: 'Meera S' },
  summary: 'Computer Science graduate. Skilled in Python and SQL.',
  skills: [{ category: 'Languages', items: ['Python', 'SQL'] }],
  experience: [],
  projects: [{ name: 'Campus Navigator', bullets: [{ text: 'Built an Android app used by 400 students during orientation week' }] }],
  education: [{ degree: 'B.E. Computer Science', institution: 'Anna University', year: '2026' }],
  certifications: [{ name: 'Infosys Springboard Python Certificate' }],
};
const F = sanitizeResumeJSON(FRESHER, { targetPages: 1, maxBulletsPerRole: 4 }).resume;
check('fresher target is 1 page', targetPagesFor(0), 1);
check('projects survive for a candidate with no roles', F.projects.length, 1);
check('education survives', F.education.length, 1);
check('employer-internal fresher certificate is dropped', F.certifications.length, 0);
check('no empty achievements array is left as content', F.achievements.length, 0);

console.log('\nlegacy text mode obeys the same rules');
const txt = sanitizeResumeText(
  'PROFESSIONAL SUMMARY\nA summary.\n\nKEY ACHIEVEMENTS\n' +
  '• Reduced regression time by 60%\n• Improved coverage by [ADD METRIC: what %?]\n\n' +
  'QUANTIFIED ACHIEVEMENTS\n• 60% faster regression\n\nEDUCATION\nB.Tech\n');
check('placeholders gone from text mode', /\[[^\]]*\]/.test(txt), false);
check('the duplicate heading is gone', /QUANTIFIED ACHIEVEMENTS/.test(txt), false);
check('the real content survives', /Reduced regression time by 60%/.test(txt), true);
check('education survives the heading surgery', /EDUCATION/.test(txt), true);

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
