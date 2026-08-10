// ============================================================================
// ZapKitt Jobs V0.5 — Unit tests
// Run: node tests/jobs.test.mjs
// ============================================================================
import { classifyIT, classifyH1B, classifySponsorship, classifyRemote, extractSkills, classifyJob } from '../api/_jobs-rules.js';
import { normalizeText, jobHash } from '../api/_jobs-source.js';

let pass = 0, fail = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         expected ' + JSON.stringify(expected) + '\n         actual   ' + JSON.stringify(actual)); }
}

// ── IT Classification ───────────────────────────────────────────────────────
console.log('\nIT classification');
check('Java Developer is IT',         classifyIT('Java Developer', '').is_it_job, true);
check('Java Developer category',      classifyIT('Java Developer', '').it_category, 'Java');
check('Software Engineer is IT',      classifyIT('Software Engineer', '').is_it_job, true);
check('DevOps Engineer is IT',        classifyIT('DevOps Engineer', '').is_it_job, true);
check('DevOps category',              classifyIT('DevOps Engineer', '').it_category, 'DevOps');
check('Cloud Architect is IT',        classifyIT('Cloud Engineer', '').is_it_job, true);
check('SAP Consultant is IT',         classifyIT('SAP Consultant', '').is_it_job, true);
check('Power BI Developer is IT',     classifyIT('Power BI Developer', '').is_it_job, true);
check('Database Administrator is IT', classifyIT('Database Administrator', '').is_it_job, true);
check('Full Stack Developer is IT',   classifyIT('Full Stack Developer', '').is_it_job, true);
check('React Developer is Frontend',  classifyIT('React Developer', '').it_category, 'Frontend');
check('ML Engineer is AI/ML',         classifyIT('Machine Learning Engineer', '').it_category, 'AI/ML');
check('Cybersecurity Analyst is IT',  classifyIT('Cybersecurity Analyst', '').is_it_job, true);
check('QA Engineer is IT',            classifyIT('QA Engineer', '').is_it_job, true);
check('IT Specialist is IT',          classifyIT('IT Specialist', '').is_it_job, true);

console.log('\nNon-IT classification');
check('Nurse is not IT',              classifyIT('Registered Nurse', '').is_it_job, false);
check('Teacher is not IT',            classifyIT('High School Teacher', '').is_it_job, false);
check('Truck Driver is not IT',       classifyIT('Truck Driver', '').is_it_job, false);
check('Accountant is not IT',         classifyIT('Staff Accountant', '').is_it_job, false);
check('Restaurant Manager not IT',    classifyIT('Restaurant Manager', '').is_it_job, false);
check('Cashier is not IT',            classifyIT('Cashier', '').is_it_job, false);
check('Plumber is not IT',            classifyIT('Licensed Plumber', '').is_it_job, false);

console.log('\nAmbiguous IT classification');
check('Unknown title needs AI',       classifyIT('Specialist III', '').method, 'UNKNOWN');
check('Analyst alone is ambiguous',   classifyIT('Analyst', '').method, 'UNKNOWN');

console.log('\nIT from description');
check('Generic title with Java desc', classifyIT('Specialist', 'Must have 5 years Java experience').is_it_job, true);

// ── H1B Classification ─────────────────────────────────────────────────────
console.log('\nH1B classification');
check('Explicit H1B', classifyH1B('H-1B sponsorship available').status, 'EXPLICIT');
check('H1B with different format', classifyH1B('We will sponsor H1B visa').status, 'EXPLICIT');
check('Visa sponsorship available', classifyH1B('Visa sponsorship available for qualified candidates').status, 'EXPLICIT');
check('No visa sponsorship', classifyH1B('No visa sponsorship provided').status, 'NOT_SUPPORTED');
check('Does not sponsor', classifyH1B('The company does not sponsor visas').status, 'NOT_SUPPORTED');
check('Unable to sponsor', classifyH1B('We are unable to sponsor work visas').status, 'NOT_SUPPORTED');
check('No mention is UNKNOWN', classifyH1B('Great opportunity for engineers').status, 'UNKNOWN');
check('Work auth is NOT H1B', classifyH1B('Must be authorized to work in the United States').status, 'UNKNOWN');
check('Evidence is captured', classifyH1B('We offer H-1B sponsorship to qualified candidates').evidence.length > 0, true);

// ── Sponsorship Classification ──────────────────────────────────────────────
console.log('\nSponsorship classification');
check('Visa sponsorship explicit', classifySponsorship('Visa sponsorship is available').status, 'EXPLICIT');
check('Will sponsor explicit', classifySponsorship('We will sponsor qualified candidates').status, 'EXPLICIT');
check('No sponsorship', classifySponsorship('No sponsorship available').status, 'NOT_SUPPORTED');
check('Cannot sponsor', classifySponsorship('We cannot sponsor visas').status, 'NOT_SUPPORTED');
check('No mention is UNKNOWN', classifySponsorship('Join our amazing team').status, 'UNKNOWN');

// ── Remote Classification ───────────────────────────────────────────────────
console.log('\nRemote classification');
check('Remote US', classifyRemote('', 'Remote - United States', ''), 'REMOTE_US');
check('Fully remote is REMOTE_US', classifyRemote('', 'This is a fully remote position', ''), 'REMOTE_US');
check('100% remote is REMOTE_US', classifyRemote('', '100% remote within US', ''), 'REMOTE_US');
check('Remote anywhere is GLOBAL', classifyRemote('', 'Remote anywhere in the world', ''), 'REMOTE_GLOBAL');
check('Hybrid', classifyRemote('', 'Hybrid work arrangement', ''), 'HYBRID');
check('On-site', classifyRemote('', 'On-site position in Dallas', ''), 'ONSITE');
check('No mention is UNKNOWN', classifyRemote('Engineer', 'Build great stuff', ''), 'UNKNOWN');
check('Telework eligible is REMOTE_US', classifyRemote('', 'Telework eligible', ''), 'REMOTE_US');

// ── Skills Extraction ───────────────────────────────────────────────────────
console.log('\nSkills extraction');
const skills1 = extractSkills('We need a Java developer with Spring Boot and AWS experience');
check('Java found', skills1.includes('Java'), true);
check('Spring Boot found', skills1.includes('Spring Boot'), true);
check('AWS found', skills1.includes('AWS'), true);

const skills2 = extractSkills('Python, Django, PostgreSQL, Docker required');
check('Python found', skills2.includes('Python'), true);
check('Django found', skills2.includes('Django'), true);
check('PostgreSQL found', skills2.includes('PostgreSQL'), true);
check('Docker found', skills2.includes('Docker'), true);

check('No skills in empty text', extractSkills('').length, 0);

// ── Normalization ───────────────────────────────────────────────────────────
console.log('\nText normalization');
check('Lowercase', normalizeText('JAVA DEVELOPER'), 'java developer');
check('Special chars removed', normalizeText('C# Developer!'), 'c developer');
check('Extra spaces collapsed', normalizeText('Java   Developer'), 'java developer');
check('Trim whitespace', normalizeText('  Java  '), 'java');
check('Empty string', normalizeText(''), '');
check('Null safe', normalizeText(null), '');

// ── Job Hash ────────────────────────────────────────────────────────────────
console.log('\nJob hash / deduplication');
const h1 = jobHash('Acme Corp', 'Java Developer', 'Dallas, TX', 'Build things');
const h2 = jobHash('Acme Corp', 'Java Developer', 'Dallas, TX', 'Build things');
const h3 = jobHash('Other Inc', 'Java Developer', 'Dallas, TX', 'Build things');
check('Same job same hash', h1, h2);
check('Different company different hash', h1 === h3, false);
check('Hash is 32 chars', h1.length, 32);

const h4 = jobHash('ACME CORP', 'java developer', 'DALLAS, TX', 'Build things');
check('Case insensitive hash', h1, h4);

// ── Full pipeline ───────────────────────────────────────────────────────────
console.log('\nFull classification pipeline');
const result = classifyJob({
  title: 'Senior Java Developer',
  description: 'H-1B sponsorship available. Must have 5+ years Java, Spring Boot. Remote US position.',
  location_raw: 'Remote - United States'
});
check('Pipeline: is IT', result.is_it_job, true);
check('Pipeline: category', result.it_category, 'Java');
check('Pipeline: method', result.classification_method, 'RULE');
check('Pipeline: H1B explicit', result.h1b_status, 'EXPLICIT');
check('Pipeline: sponsorship explicit', result.sponsorship_status, 'EXPLICIT');
check('Pipeline: remote US', result.remote_type, 'REMOTE_US');
check('Pipeline: has skills', result.skills.length > 0, true);
check('Pipeline: no AI needed', result.needs_ai, false);

const ambiguous = classifyJob({
  title: 'Specialist III',
  description: 'Support the team in daily operations.',
  location_raw: 'Washington, DC'
});
check('Ambiguous: needs AI', ambiguous.needs_ai, true);

// ── Summary ─────────────────────────────────────────────────────────────────
console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
