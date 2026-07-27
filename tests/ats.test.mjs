// Accuracy tests for the ATS matcher's deterministic core.
// Run: node tests/ats.test.mjs
//
// These cover the cases that make competitor scores untrustworthy: substring
// false positives, alias false negatives, and symbol-bearing skill names.
import { norm, variants, findInResume, scoreOf, formatChecks } from '../api/ats.js';

let pass = 0, fail = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         expected ' + JSON.stringify(expected) + '\n         actual   ' + JSON.stringify(actual)); }
}

const R = t => ' ' + norm(t) + ' ';
const has = (resume, kw) => !!findInResume(R(resume), kw);

console.log('\nsubstring false positives');
check('"Java" not found in a JavaScript-only resume', has('Built UIs in JavaScript and React', 'Java'), false);
check('"Java" found when actually present', has('Backend services in Java and Spring Boot', 'Java'), true);
check('"R" not found inside ordinary prose', has('Managed reporting and dashboards', 'R'), false);
check('"Go" not found inside "Google"', has('Interned at Google on ads', 'Go'), false);

console.log('\nsymbol-bearing names');
check('"C++" not satisfied by the letter C', has('Wrote c programs in college', 'C++'), false);
check('"C++" found when present', has('Systems work in C++ and Rust', 'C++'), true);
check('"C#" not satisfied by "C++"', has('Built engines in C++', 'C#'), false);
check('"C#" found when present', has('Enterprise apps in C# and .NET', 'C#'), true);
check('".NET" found when present', has('Enterprise apps in C# and .NET', '.NET'), true);

console.log('\naliases (JD term vs resume wording)');
check('JD "Amazon Web Services" matches resume "AWS"', has('Deployed on AWS Lambda', 'Amazon Web Services'), true);
check('JD "AWS" matches resume "Amazon Web Services"', has('Migrated to Amazon Web Services', 'AWS'), true);
check('JD "Kubernetes" matches resume "K8s"', has('Ran workloads on K8s clusters', 'Kubernetes'), true);
check('JD "CI/CD" matches resume "continuous integration"', has('Owned continuous integration pipelines', 'CI/CD'), true);
check('JD "Node.js" matches resume "NodeJS"', has('APIs in NodeJS and Express', 'Node.js'), true);
check('JD "PostgreSQL" matches resume "Postgres"', has('Tuned Postgres queries', 'PostgreSQL'), true);
check('plural: JD "REST APIs" matches resume "REST API"', has('Designed a REST API for billing', 'REST APIs'), true);

console.log('\naliases must NOT over-match');
check('JD "GitHub Actions" NOT satisfied by "CI/CD"', has('Set up CI/CD with Jenkins', 'GitHub Actions'), false);
check('JD "Terraform" NOT satisfied by "infrastructure"', has('Managed cloud infrastructure', 'Terraform'), false);
check('JD "Apache Kafka" matches resume "Kafka"', has('Streaming with Kafka', 'Apache Kafka'), true);

console.log('\nscoring formula (required 2x, preferred 1x)');
check('all matched = 100', scoreOf([
  { importance: 'required', found: true }, { importance: 'preferred', found: true }
]), 100);
check('none matched = 0', scoreOf([
  { importance: 'required', found: false }, { importance: 'preferred', found: false }
]), 0);
check('required weighs double: req hit + pref miss = 67', scoreOf([
  { importance: 'required', found: true }, { importance: 'preferred', found: false }
]), 67);
check('required miss + pref hit = 33', scoreOf([
  { importance: 'required', found: false }, { importance: 'preferred', found: true }
]), 33);
check('empty keyword set = 0 (no divide by zero)', scoreOf([]), 0);

console.log('\ndeterminism');
const sample = 'Built REST APIs in Python on AWS with Docker and Kubernetes.';
const kws = ['Python', 'AWS', 'Kubernetes', 'Terraform', 'Kafka'];
const run = () => kws.map(k => has(sample, k));
check('same input gives same result across runs', run(), run());
check('correct found/missing split', run(), [true, true, true, false, false]);

console.log('\nformat checks');
const good = `Priya Sharma
priya.sharma@utdallas.edu | +1 469-555-0134 | linkedin.com/in/priyasharma

EXPERIENCE
Data Engineer, Infosys
- Built ETL pipelines processing 2,400,000 records daily
- Cut reporting time by 65% across 3 business units
- Supported 12000 users on the analytics platform

EDUCATION
MS Computer Science, University of Texas at Dallas

SKILLS
Python, SQL, Spark, Airflow`;
const g = formatChecks(good);
check('email detected', g.checks.find(c => c.id === 'email').pass, true);
check('phone detected', g.checks.find(c => c.id === 'phone').pass, true);
check('linkedin detected', g.checks.find(c => c.id === 'linkedin').pass, true);
check('experience section detected', g.checks.find(c => c.id === 'experience').pass, true);
check('education section detected', g.checks.find(c => c.id === 'education').pass, true);
check('skills section detected', g.checks.find(c => c.id === 'skills').pass, true);
check('quantified achievements found (>=3)', g.quantHits >= 3, true);

const bare = 'I am a hard working person looking for a job in software. I like coding and teamwork.';
const b = formatChecks(bare);
check('missing email flagged', b.checks.find(c => c.id === 'email').pass, false);
check('missing sections flagged', b.checks.find(c => c.id === 'experience').pass, false);
check('no quantified achievements flagged', b.checks.find(c => c.id === 'quantified').pass, false);
check('short resume flagged', b.checks.find(c => c.id === 'length').pass, false);

console.log('\nvariants sanity');
check('variants of AWS include the canonical form', variants('AWS').includes('amazon web services'), true);
check('variants are all normalised (no punctuation leaks)', variants('Node.js').every(v => /^[a-z0-9 ]*$/.test(v)), true);

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
