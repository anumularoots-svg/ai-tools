// Accuracy tests for mock interview score reconciliation.
// Run: node tests/interview.test.mjs
//
// The defect: the report's overall_score was produced by the language model
// doing a weighted average in its head. It could disagree with the categories
// printed beside it and with the per-question scores the candidate was shown
// live during the session. A scoring product that contradicts itself is worse
// than no score at all.
import { computeOverallScore, verdictFor, readinessFor, reconcileReport, CATEGORY_WEIGHTS } from '../api/_interview-engine.js';

let pass = 0, fail = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         expected ' + JSON.stringify(expected) + '\n         actual   ' + JSON.stringify(actual)); }
}

const cats = { technical: 70, production_thinking: 68, problem_solving: 72, communication: 80, resume_knowledge: 65, confidence: 70 };
// 70*.35 + 68*.20 + 72*.15 + 80*.10 + 65*.10 + 70*.10 = 24.5+13.6+10.8+8+6.5+7 = 70.4
const expected = Math.round(70 * .35 + 68 * .20 + 72 * .15 + 80 * .10 + 65 * .10 + 70 * .10);

console.log('\nweights');
check('weights sum to 1', Math.round(Object.values(CATEGORY_WEIGHTS).reduce((a, b) => a + b, 0) * 100) / 100, 1);

console.log('\noverall score arithmetic');
check('weighted average computed correctly', computeOverallScore(cats), expected);
check('all zeros -> 0', computeOverallScore({ technical: 0, production_thinking: 0, problem_solving: 0, communication: 0, resume_knowledge: 0, confidence: 0 }), 0);
check('all hundreds -> 100', computeOverallScore({ technical: 100, production_thinking: 100, problem_solving: 100, communication: 100, resume_knowledge: 100, confidence: 100 }), 100);
check('missing categories renormalise instead of scoring 0', computeOverallScore({ technical: 80, communication: 80 }), 80);
check('no categories -> null', computeOverallScore({}), null);
check('null input -> null', computeOverallScore(null), null);

console.log("\nthe model's bad arithmetic is overridden");
let r = reconcileReport({ overall_score: 95, overall_verdict: 'Strong Hire', categories: cats, questions: [] }, []);
check('inflated 95 replaced with the real average', r.overall_score, expected);
check('verdict re-derived from the real score', r.overall_verdict, verdictFor(expected));

console.log('\nverdict bands');
check('80 -> Strong Hire', verdictFor(80), 'Strong Hire');
check('79 -> Hire', verdictFor(79), 'Hire');
check('65 -> Hire', verdictFor(65), 'Hire');
check('64 -> Lean Hire', verdictFor(64), 'Lean Hire');
check('50 -> Lean Hire', verdictFor(50), 'Lean Hire');
check('49 -> No Hire', verdictFor(49), 'No Hire');
check('readiness 75 -> Ready', readinessFor(75), 'Ready');
check('readiness 50 -> Needs Work', readinessFor(50), 'Needs Work');
check('readiness 49 -> Not Ready', readinessFor(49), 'Not Ready');

console.log('\nverdict can never contradict the score');
[0, 15, 33, 49, 50, 64, 65, 79, 80, 92, 100].forEach(s => {
  const rr = reconcileReport({ categories: { technical: s, production_thinking: s, problem_solving: s, communication: s, resume_knowledge: s, confidence: s }, overall_verdict: 'Strong Hire' }, []);
  check('score ' + s + ' -> ' + verdictFor(s), rr.overall_verdict, verdictFor(rr.overall_score));
});

console.log('\nout-of-range values are clamped');
r = reconcileReport({ categories: { technical: 150, production_thinking: -20, problem_solving: 50, communication: 50, resume_knowledge: 50, confidence: 50 } }, []);
check('150 clamped to 100', r.categories.technical, 100);
check('-20 clamped to 0', r.categories.production_thinking, 0);
check('score stays in range', r.overall_score >= 0 && r.overall_score <= 100, true);

console.log('\nper-question scores match what the candidate saw live');
r = reconcileReport({
  categories: cats,
  questions: [{ q: 'Q1', score: 9 }, { q: 'Q2', score: 8 }, { q: 'Q3', score: 7 }]
}, [{ q: 'Q1', score: 3 }, { q: 'Q2', score: 6 }, { q: 'Q3', score: 0 }]);
check('live scores win over the report re-score', r.questions.map(q => q.score), [3, 6, 0]);
check('question text preserved', r.questions.map(q => q.q), ['Q1', 'Q2', 'Q3']);

console.log('\nno live scores available');
r = reconcileReport({ categories: cats, questions: [{ q: 'Q1', score: 7 }, { q: 'Q2' }] }, null);
check("report's own score kept when there is nothing to compare to", r.questions[0].score, 7);
check('missing question score defaults to 0, not undefined', r.questions[1].score, 0);

console.log('\nper-question scores clamped to 0-10');
r = reconcileReport({ categories: cats, questions: [{ q: 'Q1', score: 50 }, { q: 'Q2', score: -5 }] }, null);
check('50 clamped to 10', r.questions[0].score, 10);
check('-5 clamped to 0', r.questions[1].score, 0);

console.log('\nboth report shapes get a readiness field');
r = reconcileReport({ categories: cats, hiring_readiness: 'Ready' }, []);
check('hiring_readiness re-derived', r.hiring_readiness, readinessFor(expected));
r = reconcileReport({ categories: cats, interview_readiness: 'Not Ready' }, []);
check('interview_readiness re-derived', r.interview_readiness, readinessFor(expected));

console.log('\nreports without categories are left usable');
r = reconcileReport({ overall_score: 72, questions: [] }, []);
check('existing score preserved when categories are absent', r.overall_score, 72);
r = reconcileReport(null, []);
check('null report does not throw', typeof r, 'object');

console.log('\ndeterminism');
const a = reconcileReport({ categories: cats, questions: [{ q: 'Q1', score: 5 }] }, [{ q: 'Q1', score: 4 }]);
const b = reconcileReport({ categories: cats, questions: [{ q: 'Q1', score: 5 }] }, [{ q: 'Q1', score: 4 }]);
check('same input gives identical output', JSON.stringify(a), JSON.stringify(b));

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
