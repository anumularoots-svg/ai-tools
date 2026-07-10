// Ko-fi webhook receiver. Ko-fi POSTs application/x-www-form-urlencoded with a `data`
// field holding a JSON string. On a valid Shop Order / donation we record the buyer's
// email + tier in Redis so the interview app can unlock the matching paid round.
//
// Setup:
//   1. Ko-fi → Settings → Webhooks/API → set URL to https://zapkitt.com/api/kofi
//   2. Copy the "Verification Token" → set env KOFI_VERIFICATION_TOKEN
//   3. Create two Shop Items: $2 (Round 2) and $5 (Round 3)
//   4. Configure Upstash (see api/_kv.js) → UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
import { kvReady, kvSetEx } from './_kv.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    // Vercel parses urlencoded bodies into an object; be tolerant of raw strings too.
    let dataStr = '';
    if (req.body && typeof req.body === 'object' && req.body.data) dataStr = req.body.data;
    else if (typeof req.body === 'string') dataStr = new URLSearchParams(req.body).get('data') || '';
    if (!dataStr) return res.status(400).json({ error: 'no data' });

    const d = JSON.parse(dataStr);

    const expected = process.env.KOFI_VERIFICATION_TOKEN || '';
    if (expected && d.verification_token !== expected) return res.status(401).json({ error: 'bad token' });

    const email = String(d.email || '').trim().toLowerCase();
    const amount = parseFloat(d.amount || '0') || 0;
    if (!email) return res.status(200).json({ ok: true, note: 'no email on payment' });

    // Map amount → tier ($5+ = Round 3, $2+ = Round 2).
    let tier = '';
    if (amount >= 5) tier = 'r3';
    else if (amount >= 2) tier = 'r2';
    if (!tier) return res.status(200).json({ ok: true, note: 'amount below any tier' });

    // Record the unlock, valid 7 days, one-time use (consumed on verifyUnlock).
    if (kvReady()) {
      await kvSetEx('kofi:' + email + ':' + tier, 7 * 24 * 3600,
        JSON.stringify({ ts: Date.now(), amount, name: d.from_name || '' }));
    }
    return res.status(200).json({ ok: true, tier });
  } catch (e) {
    // Always 200 so Ko-fi doesn't keep retrying; log the reason.
    console.error('Ko-fi webhook error:', e.message);
    return res.status(200).json({ ok: false, error: e.message });
  }
}
