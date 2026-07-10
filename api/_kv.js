// Minimal Upstash Redis REST client — no dependency, works on Vercel serverless.
// Configure with UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (free at upstash.com).
// If unconfigured, kvReady() is false and callers degrade gracefully.
const URL = process.env.UPSTASH_REDIS_REST_URL || '';
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';

export function kvReady() { return !!(URL && TOKEN); }

async function cmd(args) {
  if (!kvReady()) return null;
  const r = await fetch(URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(args)
  });
  if (!r.ok) throw new Error('KV ' + r.status);
  const d = await r.json();
  return d.result;
}

export function kvSetEx(key, seconds, val) { return cmd(['SET', key, val, 'EX', String(seconds)]); }
export function kvGet(key) { return cmd(['GET', key]); }
export function kvDel(key) { return cmd(['DEL', key]); }
// Sets — used for cross-session question de-duplication per resume.
export function kvSAdd(key, member) { return cmd(['SADD', key, member]); }
export async function kvSMembers(key) { const r = await cmd(['SMEMBERS', key]); return Array.isArray(r) ? r : []; }
export function kvExpire(key, seconds) { return cmd(['EXPIRE', key, String(seconds)]); }
// Hash — used for the per-resume Interview Memory (topics, weak/strong, scores).
export function kvHSet(key, field, val) { return cmd(['HSET', key, field, val]); }
export function kvHGetAll(key) { return cmd(['HGETALL', key]); }
// List — used to persist feedback/support messages so they survive cold starts.
export function kvLPush(key, val) { return cmd(['LPUSH', key, val]); }
export function kvLTrim(key, start, stop) { return cmd(['LTRIM', key, String(start), String(stop)]); }
export async function kvLRange(key, start, stop) { const r = await cmd(['LRANGE', key, String(start), String(stop)]); return Array.isArray(r) ? r : []; }
