// The 12 ABSOLUTE RULES, enforced deterministically.
// Run: node tests/us-rules.test.mjs
//
// These cover the failures listed in the 100% Fix Guide: visible [ADD METRIC]
// placeholders, two pages for a four-year candidate, duplicate achievement
// sections, an eight-line summary, employer-internal certifications, and the
// Project Portfolio / Additional Information sections.
import {
  sanitizeResumeJSON, sanitizeResumeText, tidyText, trimSummary,
  isUsableBullet, isWorthKeepingCert, isNonUSPhone, looksLikeSchoolEntry, normalizeResumeShape, salvageResumeJSON
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
  // Each role gets DISTINCT bullets. An earlier version of this fixture reused
  // the same sentence in all three roles, and the global de-duplicator quite
  // correctly emptied roles two and three — which is the real-world defect
  // being fixed, not something to work around in the fixture.
  experience: [
    { title: 'Senior Data Engineer', company: 'Nordstrom',
      bullets: Array.from({ length: 8 }, (_, k) => ({ text: 'Engineered a Spark streaming job number ' + k + ' processing four terabytes of clickstream events daily' })) },
    { title: 'Data Engineer', company: 'Expedia',
      bullets: Array.from({ length: 7 }, (_, k) => ({ text: 'Built an Airflow pipeline number ' + k + ' orchestrating nightly warehouse loads across source systems' })) },
    { title: 'Data Analyst', company: 'Infosys',
      bullets: Array.from({ length: 6 }, (_, k) => ({ text: 'Automated a reporting workflow number ' + k + ' replacing manual spreadsheet consolidation each week' })) },
  ],
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

// ===========================================================================
// The Manjusha case — one assertion per row of the side-by-side table.
// ===========================================================================
console.log('\nManjusha (fresher, US-targeting) — every row of the comparison table');
const REPEATED = 'Performed data analysis using Tableau and Excel to derive business insights from manufacturing datasets';
const MANJUSHA = {
  personal: {
    fullName: 'Manjusha Katragadda', title: 'Entry-Level Data Analyst / Python Developer',
    email: 'manjushak9988@gmail.com', phone: '+91 98765 43210',
    location: 'Vijayawada, Andhra Pradesh', linkedin: 'linkedin.com/in/manjusha-k',
  },
  summary: 'B.Tech graduate in Electronics and Communication Engineering pursuing a Master of Science in Data Science. Skilled in Python, SQL, PostgreSQL, and data visualization with Tableau and Excel. Completed data analytics and cybersecurity certifications with hands-on project experience. She is a quick learner. She works well in teams. She is passionate about data. She seeks a challenging role. She is available immediately.',
  skills: [
    { category: 'Programming', items: ['Python'] },
    { category: 'Databases', items: ['SQL', 'PostgreSQL'] },
    { category: 'Analytics', items: ['Tableau', 'Microsoft Excel', 'Data Cleaning'] },
  ],
  experience: [
    { title: 'Student', company: 'NRI Institute of Technology', startDate: '2021', endDate: '2025',
      bullets: [{ text: 'Studied Electronics and Communication Engineering coursework' }] },
    { title: 'Data Analytics Virtual Experience', company: 'Daikibo (Forage)',
      startDate: 'Jun 2024', endDate: 'Aug 2024', bullets: [
      { text: REPEATED },
      { text: 'Created calculated fields, dashboards, and logical classifications to identify production trends' },
      { text: REPEATED },
      { text: 'Delivered visual reports enabling stakeholders to compare performance across manufacturing plants' },
    ] },
    { title: 'Cybersecurity Virtual Internship', company: 'Forage',
      startDate: 'Sep 2024', endDate: 'Nov 2024', bullets: [
      { text: 'Analyzed web server logs to detect suspicious activity across login sessions' },
      { text: REPEATED },
      { text: 'Investigated API request patterns and applied threat detection techniques to flag incidents' },
    ] },
  ],
  projects: [{ name: 'MIMO Antenna Design — Academic Project', technologies: ['HFSS'], bullets: [
    { text: 'Designed a compact planar four-element MIMO antenna supporting LTE and 5G frequency bands' },
    { text: 'Simulated antenna performance parameters and validated design against industry specifications' },
  ] }],
  quantifiedAchievements: ['Analyzed web server logs to detect suspicious activity across login sessions'],
  projectPortfolio: [{ client: 'Daikibo', project: 'Analytics' }],
  additionalInfo: { currentLocation: 'Vijayawada, Andhra Pradesh' },
  coreCompetencies: ['Data Analysis', 'Problem Solving'],
  certifications: [
    { name: 'HackerRank SQL (Basic)' }, { name: 'The Complete SQL Bootcamp' },
    { name: 'Microsoft Excel Training' },
  ],
  education: [
    { degree: 'Master of Business Administration — Data Science', institution: 'KL University', year: 'Pursuing' },
    { degree: 'B.Tech — Electronics and Communication', institution: 'NRI Institute of Technology', year: '2021-2025' },
  ],
};
const M = sanitizeResumeJSON(MANJUSHA, {
  targetPages: 1, maxBulletsPerRole: 5, maxSummarySentences: 3, years: 0, dropNonUSLocation: true,
}).resume;

check('summary is 3 sentences, not 8', M.summary.split(/[.!?]+\s/).filter(Boolean).length <= 3, true);
check('"STUDENT" is no longer listed as a job', M.experience.some(e => /student/i.test(e.title)), false);
check('the two real internships survive', M.experience.length, 2);
check('section is titled "Projects & Internships"', M.experienceHeading, 'Projects & Internships');
check('the bullet repeated 3 times now appears once',
  JSON.stringify(M).split(REPEATED).length - 1, 1);
check('Project Portfolio removed', M.projectPortfolio, undefined);
check('Additional Information removed', M.additionalInfo, undefined);
check('Core Competencies removed', M.coreCompetencies, undefined);
check('India location removed from header', M.personal.location, '');
check('+91 phone removed from header', M.personal.phone, '');
check('email kept', M.personal.email, 'manjushak9988@gmail.com');
check('LinkedIn kept', M.personal.linkedin, 'linkedin.com/in/manjusha-k');
check('all 3 certifications kept (none employer-internal)', M.certifications.length, 3);
check('the academic project survives', M.projects.length, 1);
check('both degrees survive', M.education.length, 2);
check('no placeholders', anyPlaceholder(M), false);

console.log('\ncollege-as-employment detection');
check('"Student" at a college is not a job', looksLikeSchoolEntry({ title: 'Student', company: 'NRI Institute of Technology' }), true);
check('"B.Tech" as a title is not a job', looksLikeSchoolEntry({ title: 'B.Tech Electronics' }), true);
check('a Teaching Assistant at a university IS a job',
  looksLikeSchoolEntry({ title: 'Teaching Assistant', company: 'KL University' }), false);
check('a Research Intern at a university IS a job',
  looksLikeSchoolEntry({ title: 'Research Intern', company: 'Stanford University' }), false);
check('a normal role is untouched',
  looksLikeSchoolEntry({ title: 'Data Engineer', company: 'Nordstrom' }), false);

console.log('\nRULE 8 — phone in the header');
check('+91 is non-US', isNonUSPhone('+91 9515358589'), true);
check('+44 is non-US', isNonUSPhone('+44 20 7946 0958'), true);
check('+1 is US', isNonUSPhone('+1 512 555 0100'), false);
check('(512) 555-0100 is US', isNonUSPhone('(512) 555-0100'), false);
check('a bare 10-digit number is treated as domestic', isNonUSPhone('5125550100'), false);
check('empty is not flagged', isNonUSPhone(''), false);

// ===========================================================================
// Shape robustness — the raw-JSON-on-screen bug.
//
// A model returns whatever shape it likes. Every one of these used to throw a
// TypeError inside the endpoint's single try/catch, which was indistinguishable
// from "the model did not return JSON" — so the fallback rendered the raw JSON
// string as if it were resume prose. The user saw
// {"personal":{"fullName":"MANJUSHA KATRAGADDA"... where their resume belonged.
// ===========================================================================
console.log('\nshape robustness — no model output may crash post-processing');
const SHAPES = {
  'certifications as bare strings': { personal: { fullName: 'M' }, certifications: ['HackerRank SQL (Basic)', 'Excel Training'] },
  'a null inside an array':         { personal: { fullName: 'M' }, certifications: [null, { name: 'AWS Certified Developer' }] },
  'skills as an object':            { personal: { fullName: 'M' }, skills: { Languages: ['Python', 'SQL'] } },
  'education as an object':         { personal: { fullName: 'M' }, education: { degree: 'B.Tech' } },
  'experience as an object':        { personal: { fullName: 'M' }, experience: { title: 'Intern', bullets: ['Built a dashboard used by twelve people'] } },
  'bullets as bare strings':        { personal: { fullName: 'M' }, experience: [{ title: 'Intern', bullets: ['Did something genuinely useful here'] }] },
  'skill items as one string':      { personal: { fullName: 'M' }, skills: [{ category: 'P', items: 'Python, SQL' }] },
  'summary as an array of lines':   { personal: { fullName: 'M' }, summary: ['Line one here.', 'Line two here.'] },
  'personal missing entirely':      { summary: 'A summary here.' },
  'achievements as bare strings':   { personal: { fullName: 'M' }, achievements: ['Reduced regression time by 60% overall'] },
  'nulls scattered everywhere':     { personal: { fullName: 'M' }, experience: [null, { title: 'Dev', bullets: [null, 'Shipped a feature used by many customers'] }], education: [null] },
  'an empty object':                {},
};
for (const [name, shape] of Object.entries(SHAPES)) {
  let threw = null;
  try { sanitizeResumeJSON(shape, { targetPages: 1, maxBulletsPerRole: 5, years: 0, dropNonUSLocation: true }); }
  catch (e) { threw = e.message; }
  check(name + ' does not throw', threw, null);
}

// Coercion must PRESERVE the data, not just avoid the crash. String
// certifications previously survived the crash check and were then silently
// deleted by a `c.name && ...` filter.
console.log('\nshape coercion preserves the content');
const strCerts = normalizeResumeShape({ certifications: ['HackerRank SQL (Basic)', 'Excel Training'] });
check('string certifications become {name}', strCerts.certifications.map(c => c.name),
  ['HackerRank SQL (Basic)', 'Excel Training']);
const objSkills = normalizeResumeShape({ skills: { Languages: ['Python', 'SQL'], Tools: 'Git, Docker' } });
check('an object of skills becomes categories', objSkills.skills.map(s => s.category), ['Languages', 'Tools']);
check('a comma string of items becomes a list', objSkills.skills[1].items, ['Git', 'Docker']);
const strBullets = normalizeResumeShape({ experience: [{ title: 'Dev', bullets: ['Shipped a thing'] }] });
check('string bullets become {text}', strBullets.experience[0].bullets[0].text, 'Shipped a thing');
check('a summary array is joined', normalizeResumeShape({ summary: ['One.', 'Two.'] }).summary, 'One. Two.');
check('a missing personal block is created', typeof normalizeResumeShape({}).personal, 'object');

// ===========================================================================
// Salvaging malformed model JSON — the raw-JSON-on-screen bug, real cause.
//
// Observed in production, verbatim. Every one of these keys was emitted with
// NO VALUE, which JSON.parse cannot read and a trailing-comma repair cannot
// fix. The old code responded by printing the raw JSON at the user.
// ===========================================================================
console.log('\nsalvaging malformed model JSON');
const BROKEN = '{"personal":{"fullName":"MANJUSHA KATRAGADDA","title":"","headline":"B.Tech Graduate | Python, SQL, Data Analysis | 0 Years","email":"Manjushak9988@gmail.com","phone":"+91 - 7330989188","location":"Vijayawada, Andhra Pradesh","linkedin":"","github":""},"summary":"Enthusiastic and detail-oriented B.Tech graduate in Electronics and Communication Engineering with a strong foundation in Python, SQL, and data analysis. Skilled in developing database-driven solutions, performing data preprocessing, and applying analytical techniques to solve real-world problems. Seeking an entry-level Software Engineer, Python Developer, Backend Developer, or Data Analyst role.","skills":,"experience":,"achievements":},"education":,"certifications":}';

check('the real payload is genuinely unparseable',
  (() => { try { JSON.parse(BROKEN); return false; } catch (e) { return true; } })(), true);
const sal = salvageResumeJSON(BROKEN);
check('salvage returns something', !!sal, true);
check('it reports itself as salvaged', sal.salvaged, true);
check('the name is recovered', sal.resume.personal.fullName, 'MANJUSHA KATRAGADDA');
check('the email is recovered', sal.resume.personal.email, 'Manjushak9988@gmail.com');
check('the headline is recovered', sal.resume.personal.headline, 'B.Tech Graduate | Python, SQL, Data Analysis | 0 Years');
check('the summary is recovered whole', /Seeking an entry-level Software Engineer/.test(sal.resume.summary), true);
check('the value-less keys are named, not silently lost',
  sal.missingKeys.includes('skills') && sal.missingKeys.includes('experience'), true);
check('a salvaged resume still sanitises without throwing',
  (() => { try { sanitizeResumeJSON(sal.resume, { targetPages: 1, years: 0 }); return true; } catch (e) { return false; } })(), true);

console.log('\nother malformations a model produces');
const M2 = salvageResumeJSON('{"personal":{"fullName":"A"},"summary":"S.","skills":[{"category":"P","items":["Python"]}]');
check('an unterminated object still yields its keys', M2 && M2.resume.personal.fullName, 'A');
check('and keeps the array that did close', M2 && M2.resume.skills.length, 1);
const M3 = salvageResumeJSON('```json\n{"personal":{"fullName":"B"},"summary":"S."}\n```');
check('code fences are stripped', M3 && M3.resume.personal.fullName, 'B');
check('clean JSON is not marked salvaged', M3.salvaged, false);
const M4 = salvageResumeJSON('Here is your resume:\n{"personal":{"fullName":"C"},"summary":"S."}');
check('a chatty preamble is skipped', M4 && M4.resume.personal.fullName, 'C');
const M5 = salvageResumeJSON('{"personal":{"fullName":"D"},"skills":[{"category":"P","items":["Py"],}],"summary":"S."}');
check('a trailing comma inside an array is repaired', M5 && M5.resume.skills.length, 1);
check('prose with no JSON returns null', salvageResumeJSON('Sorry, I cannot help with that.'), null);
check('empty input returns null', salvageResumeJSON(''), null);
// A brace inside a string value must not be mistaken for structure.
const M6 = salvageResumeJSON('{"personal":{"fullName":"E"},"summary":"Used {braces} and \\"quotes\\" here."}');
check('braces inside a string do not confuse the scanner', M6 && M6.resume.summary,
  'Used {braces} and "quotes" here.');

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
