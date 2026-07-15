// ============================================================================
// Shared rate limiting + input sanitisation for all ZapKitt API routes.
//
// Rate limiting is backed by Upstash so it SURVIVES serverless cold starts and
// is shared across concurrent instances (an in-memory Map is per-instance and
// resets constantly, which abusers can trivially bypass). If Upstash is not
// configured we fall back to a per-instance memory counter — degraded, but
// better than nothing.
// ============================================================================
import { kvReady, kvIncr, kvExpire } from './_kv.js';

const mem = new Map();

export function clientIP(req) {
  const raw = (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] ||
    (req.connection && req.connection.remoteAddress) || '').toString();
  return (raw.split(',')[0] || '').trim() || 'unknown';
}

// Fixed-window limiter: allow `limit` requests per `windowSec` for `key`.
// Returns { ok, count }. Never throws — on any backend error it allows the
// request (fail-open) so a KV hiccup can never take the product down.
export async function rateLimit(key, limit, windowSec) {
  if (kvReady()) {
    try {
      const bucket = Math.floor(Date.now() / (windowSec * 1000));
      const k = 'rl:' + key + ':' + bucket;
      const n = await kvIncr(k);
      if (n === 1) await kvExpire(k, windowSec + 1); // only set TTL on first hit
      return { ok: n <= limit, count: n };
    } catch (e) { /* fall through to in-memory */ }
  }
  const now = Date.now();
  const e = mem.get(key);
  if (!e || now - e.start > windowSec * 1000) {
    if (mem.size > 5000) mem.clear(); // crude bound; this path is a fallback only
    mem.set(key, { start: now, count: 1 });
    return { ok: true, count: 1 };
  }
  e.count++;
  return { ok: e.count <= limit, count: e.count };
}

// ── Input sanitisation ──────────────────────────────────────────────────────
// User text is interpolated into AI prompts. We cannot make prompt injection
// impossible, but we DO cap size (cost/DoS), strip control characters, and
// neutralise the most common "ignore your instructions" style overrides.
const INJECTION = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/gi,
  /disregard\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/gi,
  /forget\s+(everything|all)\s+(above|before)/gi,
  /you\s+are\s+now\s+(a|an)\s+/gi,
  /system\s*prompt\s*[:=]/gi,
  /<\s*\/?\s*(system|assistant)\s*>/gi
];

// Drop C0 control characters and DEL, keeping tab (9) and newline (10).
// Done by char code so the source stays plain ASCII (no literal control bytes).
function stripControl(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out += (c === 9 || c === 10 || (c >= 32 && c !== 127)) ? s[i] : ' ';
  }
  return out;
}

export function sanitizeText(input, maxLen) {
  let s = String(input == null ? '' : input);
  s = stripControl(s);
  for (const re of INJECTION) s = s.replace(re, '[removed]');
  s = s.replace(/[ \t]{4,}/g, '   ').replace(/\n{4,}/g, '\n\n\n'); // collapse padding
  s = s.trim();
  const cap = maxLen || 8000;
  if (s.length > cap) s = s.slice(0, cap) + '\n[truncated]';
  return s;
}

// Sanitise every value of a fields object before it reaches a prompt template.
export function sanitizeFields(fields, maxLen) {
  const out = {};
  if (!fields || typeof fields !== 'object') return out;
  for (const k of Object.keys(fields)) {
    if (typeof fields[k] === 'string') out[k] = sanitizeText(fields[k], maxLen);
    else if (fields[k] != null && typeof fields[k] !== 'object') out[k] = fields[k];
  }
  return out;
}
