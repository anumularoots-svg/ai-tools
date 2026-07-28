// Honesty-guard tests for the JD-targeted resume rebuild.
// Run: node tests/tailor.test.mjs
//
// The feature is "rewrite my resume to match this job", which is one bad
// instruction away from "put skills I don't have on my resume". The prompt
// forbids that; these tests cover what happens when the model ignores the
// prompt anyway, because eventually it will.
import { findUnsupportedAdditions, rejectUnsupportedBullets } from '../api/tailor.js';

let pass = 0, fail = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         expected ' + JSON.stringify(expected) + '\n         actual   ' + JSON.stringify(actual)); }
}

const ORIGINAL = `Priya Sharma
EXPERIENCE
Data Engineer Intern, Infosys
- Built ETL pipelines in Python processing 2,400,000 records daily
- Wrote SQL transformations for the finance reporting stack
- Deployed containerised services on AWS using Docker
SKILLS
Python, SQL, AWS, Docker, Spark`;

const KEYWORDS = [
  { term: 'Python', importance: 'required' },
  { term: 'SQL', importance: 'required' },
  { term: 'AWS', importance: 'required' },
  { term: 'Docker', importance: 'preferred' },
  { term: 'Terraform', importance: 'required' },
  { term: 'Apache Airflow', importance: 'required' },
  { term: 'Kubernetes', importance: 'preferred' }
];

console.log('\nunsupported additions are detected');
check('inventing Terraform is caught',
  findUnsupportedAdditions(ORIGINAL, 'Provisioned infrastructure with Terraform across three environments', KEYWORDS),
  ['Terraform']);
check('inventing several at once is caught',
  findUnsupportedAdditions(ORIGINAL, 'Orchestrated Apache Airflow DAGs on Kubernetes using Terraform', KEYWORDS).sort(),
  ['Apache Airflow', 'Kubernetes', 'Terraform']);
check('re-wording real experience is NOT flagged',
  findUnsupportedAdditions(ORIGINAL, 'Engineered Python ETL pipelines and SQL transformations deployed to AWS with Docker', KEYWORDS),
  []);
check('empty rewrite adds nothing',
  findUnsupportedAdditions(ORIGINAL, '', KEYWORDS), []);

console.log('\nalias re-wording is allowed (same fact, the JD\'s word)');
const k8sResume = 'Ran production workloads on K8s clusters and wrote Python tooling';
check('resume says K8s, rewrite says Kubernetes -> allowed',
  findUnsupportedAdditions(k8sResume, 'Operated Kubernetes clusters running production workloads', KEYWORDS),
  []);
check('resume never mentions K8s -> Kubernetes is flagged',
  findUnsupportedAdditions('Wrote Python tooling for batch jobs', 'Operated Kubernetes clusters', KEYWORDS),
  ['Kubernetes']);

console.log('\nbullets that inflate are reverted, not shipped');
let r = rejectUnsupportedBullets(ORIGINAL, [
  { original: 'Built ETL pipelines in Python processing 2,400,000 records daily', rewritten: 'Engineered Python ETL pipelines processing 2,400,000 records daily', why: 'leads with the JD term' },
  { original: 'Wrote SQL transformations for the finance reporting stack', rewritten: 'Built Terraform modules and SQL transformations for finance reporting', why: 'adds Terraform' }
], KEYWORDS);
check('clean bullet kept as rewritten', r.kept[0].rewritten, 'Engineered Python ETL pipelines processing 2,400,000 records daily');
check('clean bullet not marked reverted', r.kept[0].reverted, false);
check('inflated bullet reverted to the original wording', r.kept[1].rewritten, 'Wrote SQL transformations for the finance reporting stack');
check('reverted bullet is marked', r.kept[1].reverted, true);
check('reverted bullet explains why', /Terraform/.test(r.kept[1].why), true);
check('the attempt is reported, not hidden', r.rejected.length, 1);
check('what it tried to add is recorded', r.rejected[0].added, ['Terraform']);

console.log('\nthe rebuilt text never contains an unsupported keyword');
const rebuilt = r.kept.map(b => b.rewritten).join('\n');
check('guard output is clean', findUnsupportedAdditions(ORIGINAL, rebuilt, KEYWORDS), []);

console.log('\nevery bullet inflated -> all reverted, nothing invented survives');
r = rejectUnsupportedBullets(ORIGINAL, [
  { original: 'Built ETL pipelines in Python', rewritten: 'Built Airflow DAGs in Python' },
  { original: 'Wrote SQL transformations', rewritten: 'Wrote SQL transformations on Kubernetes' }
], KEYWORDS);
check('both reverted', r.kept.map(b => b.reverted), [true, true]);
check('output clean', findUnsupportedAdditions(ORIGINAL, r.kept.map(b => b.rewritten).join('\n'), KEYWORDS), []);

console.log('\nedge cases');
check('no bullets -> no output, no crash', rejectUnsupportedBullets(ORIGINAL, [], KEYWORDS).kept.length, 0);
check('blank rewrite is dropped', rejectUnsupportedBullets(ORIGINAL, [{ original: 'x', rewritten: '   ' }], KEYWORDS).kept.length, 0);
check('inflated bullet with no original is dropped entirely',
  rejectUnsupportedBullets(ORIGINAL, [{ original: '', rewritten: 'Deployed Terraform stacks' }], KEYWORDS).kept.length, 0);
check('no keywords -> nothing to flag', findUnsupportedAdditions(ORIGINAL, 'Anything at all about Terraform', []), []);

console.log('\nsubstring safety carries over from the matcher');
check('"Java" in JD is not satisfied by JavaScript in the rewrite',
  findUnsupportedAdditions('Built UIs in JavaScript', 'Built interfaces in JavaScript and React', [{ term: 'Java', importance: 'required' }]),
  []);

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
