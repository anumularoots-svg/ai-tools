// ============================================================================
// ZapKitt — Dodo Payments webhook  (POST /api/dodo)
//
// Replaces api/kofi.js. Dodo is the Merchant of Record: it takes the payment,
// then calls this endpoint, and this endpoint records the unlock that the
// interview page redeems.
//
// Setup:
//   1. Dodo dashboard > Developer > Webhooks > add https://zapkitt.com/api/dodo
//   2. Copy the signing secret, set DODO_WEBHOOK_SECRET on the Vercel project
//   3. Products: "Mock Interview Round 2" $5, "Mock Interview Round 3" $9
//
// SECURITY: this endpoint grants paid features to an unauthenticated caller,
// so it FAILS CLOSED. With no secret configured it refuses every request. The
// previous Ko-fi version had this backwards -- its check was skipped when the
// token was unset, which meant anyone who could POST here got a free unlock.
// Do not reintroduce that shape.
//
// Signature scheme is Standard Webhooks, the same one Svix implements:
//   signed content = "{webhook-id}.{webhook-timestamp}.{raw body}"
//   header webhook-signature = "v1,<base64 hmac-sha256>" (space-separated list)
// ============================================================================
import crypto from 'node:crypto';
import { kvReady, kvSetEx } from './_kv.js';

// The raw body is required byte-for-byte: re-serialising a parsed object
// changes key order and whitespace, and the signature no longer matches.
export const config = { api: { bodyParser: false } };

const TOLERANCE_SECONDS = 300; // reject anything older than 5 minutes (replay)

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 1e6) { reject(new Error('body too large')); req.destroy(); }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// Dodo's secret is base64 behind a `whsec_` prefix, matching Standard Webhooks.
function secretKey(raw) {
  const s = String(raw || '');
  const body = s.startsWith('whsec_') ? s.slice(6) : s;
  try {
    const buf = Buffer.from(body, 'base64');
    if (buf.length) return buf;
  } catch (e) { /* fall through to raw bytes */ }
  return Buffer.from(body, 'utf8');
}

function signatureMatches(header, expectedB64) {
  // "v1,abc v1,def" — any one version may match.
  const expected = Buffer.from(expectedB64, 'utf8');
  return String(header || '').split(' ').some(part => {
    const value = part.includes(',') ? part.slice(part.indexOf(',') + 1) : part;
    const got = Buffer.from(value, 'utf8');
    // timingSafeEqual throws on length mismatch, which is itself a non-match.
    return got.length === expected.length && crypto.timingSafeEqual(got, expected);
  });
}

// $5 -> Round 2, $9 -> Round 3. total_amount arrives in CENTS: $9 is 900, not
// 9. Comparing the raw value against 9 would grant Round 3 for five cents.
// These thresholds mirror the prices on ai-mock-interview.html -- change both
// together or the cheaper round unlocks the dearer one.
export function tierForCents(totalAmountCents) {
  const dollars = Number(totalAmountCents) / 100;
  if (!isFinite(dollars) || dollars <= 0) return '';
  if (dollars >= 9) return 'r3';
  if (dollars >= 5) return 'r2';
  return '';
}

// The payload shape is documented loosely, so read the customer email from the
// places Dodo is known to put it rather than trusting one path.
export function emailFrom(data) {
  const d = data || {};
  const candidates = [
    d.customer && d.customer.email,
    d.customer_email,
    d.email,
    d.billing && d.billing.email
  ];
  const hit = candidates.find(v => typeof v === 'string' && v.includes('@'));
  return hit ? hit.trim().toLowerCase() : '';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const secret = process.env.DODO_WEBHOOK_SECRET || '';
  if (!secret) {
    console.error('dodo: DODO_WEBHOOK_SECRET is not set — refusing to grant unlocks. Dodo dashboard > Developer > Webhooks.');
    return res.status(503).json({ error: 'webhook not configured' });
  }

  let raw;
  try { raw = await readRawBody(req); }
  catch (e) { return res.status(400).json({ error: 'unreadable body' }); }

  const id = req.headers['webhook-id'];
  const timestamp = req.headers['webhook-timestamp'];
  const signature = req.headers['webhook-signature'];
  if (!id || !timestamp || !signature) return res.status(400).json({ error: 'missing signature headers' });

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!isFinite(age) || age > TOLERANCE_SECONDS) {
    return res.status(400).json({ error: 'timestamp outside tolerance' });
  }

  const expected = crypto.createHmac('sha256', secretKey(secret))
    .update(id + '.' + timestamp + '.' + raw)
    .digest('base64');
  if (!signatureMatches(signature, expected)) {
    console.error('dodo: signature mismatch for webhook-id ' + id);
    return res.status(401).json({ error: 'bad signature' });
  }

  let event;
  try { event = JSON.parse(raw); }
  catch (e) { return res.status(400).json({ error: 'bad json' }); }

  // Acknowledge everything we do not act on, so Dodo stops retrying it.
  if (event.type !== 'payment.succeeded') {
    return res.status(200).json({ ok: true, note: 'ignored ' + event.type });
  }

  const data = event.data || {};
  const email = emailFrom(data);
  if (!email) {
    console.error('dodo: payment.succeeded with no customer email, payment ' + (data.payment_id || '?'));
    return res.status(200).json({ ok: true, note: 'no email on payment' });
  }

  const tier = tierForCents(data.total_amount);
  if (!tier) {
    return res.status(200).json({ ok: true, note: 'amount below any tier' });
  }

  if (!kvReady()) {
    // Returning non-2xx makes Dodo retry, which is what we want: the customer
    // has paid and we must not silently drop the unlock.
    console.error('dodo: Upstash not configured, cannot record unlock for ' + email);
    return res.status(503).json({ error: 'storage unavailable' });
  }

  // 30 days: the Ko-fi version expired after 7, so anyone who paid and did not
  // redeem within a week silently lost it. Consumed on redemption either way.
  await kvSetEx('pay:' + email + ':' + tier, 30 * 24 * 3600, JSON.stringify({
    ts: Date.now(),
    provider: 'dodo',
    payment_id: data.payment_id || '',
    amount_cents: Number(data.total_amount) || 0,
    currency: data.currency || 'USD'
  }));

  console.log('dodo: unlocked ' + tier + ' for ' + email + ' (' + (data.payment_id || 'no id') + ')');
  return res.status(200).json({ ok: true, tier });
}
