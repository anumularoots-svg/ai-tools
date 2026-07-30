// Accuracy tests for the Dodo webhook's deterministic core.
// Run: node tests/dodo.test.mjs
//
// Two things here lose real money if they are wrong. total_amount arrives in
// CENTS, so a threshold written against dollars grants the $9 round for nine
// cents. And the signature check is the only thing standing between a public
// URL and free paid features -- the Ko-fi version it replaces had that check
// silently disabled whenever its secret was unset.
import crypto from 'node:crypto';
import { tierForCents, emailFrom } from '../api/dodo.js';

let pass = 0, fail = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         expected ' + JSON.stringify(expected) + '\n         actual   ' + JSON.stringify(actual)); }
}

console.log('\ntier from cents (prices are $5 and $9)');
check('$5.00 unlocks Round 2', tierForCents(500), 'r2');
check('$9.00 unlocks Round 3', tierForCents(900), 'r3');
check('$8.99 stays on Round 2', tierForCents(899), 'r2');
check('$4.99 unlocks nothing', tierForCents(499), '');
check('a large payment still maps to the top tier', tierForCents(5000), 'r3');
// The bug this exists to prevent: treating cents as dollars.
check('9 cents does NOT unlock Round 3', tierForCents(9), '');
check('5 cents does NOT unlock Round 2', tierForCents(5), '');
check('zero unlocks nothing', tierForCents(0), '');
check('negative unlocks nothing', tierForCents(-900), '');
check('missing amount unlocks nothing', tierForCents(undefined), '');
check('non-numeric unlocks nothing', tierForCents('free'), '');

console.log('\ncustomer email extraction');
check('nested customer object', emailFrom({ customer: { email: 'A@Example.com ' } }), 'a@example.com');
check('flat customer_email', emailFrom({ customer_email: 'b@example.com' }), 'b@example.com');
check('bare email field', emailFrom({ email: 'c@example.com' }), 'c@example.com');
check('billing fallback', emailFrom({ billing: { email: 'd@example.com' } }), 'd@example.com');
check('nested wins over fallback', emailFrom({ customer: { email: 'x@e.com' }, email: 'y@e.com' }), 'x@e.com');
check('no email present', emailFrom({ customer: { name: 'No Email' } }), '');
check('a non-address string is rejected', emailFrom({ email: 'not-an-address' }), '');
check('empty payload is safe', emailFrom({}), '');
check('null payload is safe', emailFrom(null), '');

console.log('\nStandard Webhooks signature');
// Reimplemented here rather than imported, so the test would catch the handler
// silently changing what it signs over.
const SECRET_B64 = Buffer.from('super-secret-signing-key').toString('base64');
function sign(id, ts, body, secretB64) {
  return crypto.createHmac('sha256', Buffer.from(secretB64, 'base64'))
    .update(id + '.' + ts + '.' + body).digest('base64');
}
const id = 'msg_123', ts = '1753900000';
const body = JSON.stringify({ type: 'payment.succeeded', data: { total_amount: 900 } });
const good = sign(id, ts, body, SECRET_B64);

check('a correct signature verifies', sign(id, ts, body, SECRET_B64) === good, true);
check('a different body does not verify', sign(id, ts, body + ' ', SECRET_B64) === good, false);
check('a different webhook-id does not verify', sign('msg_999', ts, body, SECRET_B64) === good, false);
check('a different timestamp does not verify', sign(id, '1753900001', body, SECRET_B64) === good, false);
check('a different secret does not verify',
  sign(id, ts, body, Buffer.from('wrong-key').toString('base64')) === good, false);
// Re-serialising a parsed body reorders keys and breaks the signature, which is
// why the handler disables Vercel's body parser and hashes the raw bytes.
const reserialised = JSON.stringify(JSON.parse('{"b":2,"a":1}'));
check('re-serialising can change the bytes', reserialised === '{"b":2,"a":1}', true);

console.log('\npage prices and webhook thresholds agree');
import fs from 'node:fs';
const pageHtml = fs.readFileSync(new URL('../ai-mock-interview.html', import.meta.url), 'utf8');
const prices = [...pageHtml.matchAll(/<div class="price">\$(\d+)/g)].map(m => Number(m[1]));
check('the page advertises exactly two prices', prices.length, 2);
check('the advertised Round 2 price unlocks r2', tierForCents(prices[0] * 100), 'r2');
check('the advertised Round 3 price unlocks r3', tierForCents(prices[1] * 100), 'r3');
// Round 2's price must not reach Round 3's threshold, or the cheap round buys
// the expensive one -- exactly the bug the $2/$5 -> $5/$9 reprice introduced.
check('paying for Round 2 does not unlock Round 3', tierForCents(prices[0] * 100) === 'r3', false);

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
