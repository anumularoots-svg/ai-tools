// ============================================================================
// ZapKitt Jobs V1 — Single API endpoint (counts as 1 serverless function)
//
// Routes via query param `action`:
//   GET  /api/jobs                    → list jobs
//   GET  /api/jobs?action=detail&id=X → job detail
//   GET  /api/jobs?action=stats       → dashboard stats
//   GET  /api/jobs?action=cron        → trigger ingestion (protected)
//   GET  /api/jobs?action=debug       → admin debug info (protected)
// ============================================================================
import { rateLimit, clientIP } from './_ratelimit.js';
import { fetchUSAJobs } from './_jobs-source.js';
import { fetchGreenhouseJobs } from './_jobs-greenhouse.js';
import { fetchLeverJobs } from './_jobs-lever.js';
import { fetchIndiaGreenhouseJobs } from './_jobs-india.js';
import { fetchIndeedIndiaJobs } from './_jobs-indeed-india.js';
import { classifyJob } from './_jobs-rules.js';
import { classifyWithAI } from './_jobs-ai.js';
import { upsertJob, existsByHash, queryJobs, getJobById, getStats, getIndiaStats, cleanupOldJobs, logCronRun, getLastCronRun, dbReady } from './_jobs-db.js';
import { RETENTION_DAYS } from './_jobs-config.js';

// ── Owner check ─────────────────────────────────────────────────────────────
function isOwner(req) {
  // Cron requests from Vercel carry this header
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers['authorization'] === 'Bearer ' + cronSecret) return true;

  // For browser access, check a simple shared secret in a cookie or header
  const ownerKey = process.env.ZAPKITT_OWNER_KEY;
  if (!ownerKey) return false; // if not configured, block everything

  const provided = req.headers['x-zk-owner'] || req.query?.owner_key || '';
  return provided === ownerKey;
}

// ── CORS (same as existing ZapKitt pattern) ─────────────────────────────────
function setCORS(req, res) {
  const origins = ['https://zapkitt.com', 'https://www.zapkitt.com'];
  const o = req.headers.origin || '';
  res.setHeader('Access-Control-Allow-Origin', origins.includes(o) ? o : origins[0]);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-ZK-Owner');
}

// ── Main handler ────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  setCORS(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  if (!dbReady()) {
    return res.status(503).json({ error: 'Database not configured. Set NEON_DATABASE_URL.' });
  }

  const action = String(req.query?.action || 'list');

  try {
    switch (action) {
      case 'cron':        return await handleCron(req, res);
      case 'india-cron':  return await handleIndiaCron(req, res);
      case 'debug':       return await handleDebug(req, res);
      case 'detail':      return await handleDetail(req, res);
      case 'stats':       return await handleStats(req, res);
      case 'india-stats': return await handleIndiaStats(req, res);
      default:            return await handleList(req, res);
    }
  } catch (e) {
    console.error('Jobs API error:', e.message);
    return res.status(500).json({ error: 'Internal error' });
  }
}

// ── LIST ─────────────────────────────────────────────────────────────────────
async function handleList(req, res) {
  if (!isOwner(req)) return res.status(403).json({ error: 'Access denied' });

  const ip = clientIP(req);
  const rl = await rateLimit('jobs-list:' + ip, 60, 60);
  if (!rl.ok) return res.status(429).json({ error: 'Rate limited' });

  const result = await queryJobs({
    search: req.query?.search,
    location: req.query?.location,
    category: req.query?.category,
    h1b: req.query?.h1b,
    h1b_not: req.query?.h1b_not,
    sponsorship: req.query?.sponsorship,
    remote: req.query?.remote,
    is_it: req.query?.is_it,
    country: req.query?.country,
    posted: req.query?.posted,
    page: req.query?.page,
    limit: req.query?.limit
  });

  return res.status(200).json(result);
}

// ── DETAIL ──────────────────────────────────────────────────────────────────
async function handleDetail(req, res) {
  if (!isOwner(req)) return res.status(403).json({ error: 'Access denied' });

  const id = parseInt(req.query?.id);
  if (!id) return res.status(400).json({ error: 'id required' });

  const job = await getJobById(id);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  return res.status(200).json(job);
}

// ── STATS ───────────────────────────────────────────────────────────────────
async function handleStats(req, res) {
  if (!isOwner(req)) return res.status(403).json({ error: 'Access denied' });

  const stats = await getStats();
  return res.status(200).json(stats);
}

// ── DEBUG ───────────────────────────────────────────────────────────────────
async function handleDebug(req, res) {
  if (!isOwner(req)) return res.status(403).json({ error: 'Access denied' });

  const [stats, lastCron] = await Promise.all([getStats(), getLastCronRun()]);
  return res.status(200).json({
    db_connected: true,
    stats,
    last_cron: lastCron,
    env: {
      usajobs_configured: !!(process.env.USAJOBS_API_KEY && process.env.USAJOBS_USER_AGENT_EMAIL),
      neon_configured: !!process.env.NEON_DATABASE_URL,
      ai_configured: !!(process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY)
    }
  });
}

// ── CRON ─────────────────────────────────────────────────────────────────────
async function handleCron(req, res) {
  // Verify this is a legitimate cron request
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers['authorization'];

  // Allow cron secret OR owner key
  if (cronSecret && authHeader === 'Bearer ' + cronSecret) { /* ok */ }
  else if (isOwner(req)) { /* ok */ }
  else { return res.status(403).json({ error: 'Unauthorized' }); }

  const startTime = Date.now();
  const logs = [];
  const log = (level, msg) => {
    logs.push({ time: new Date().toISOString(), level, msg });
    console.log(`[jobs-cron] ${level}: ${msg}`);
  };

  let fetched = 0, inserted = 0, duplicates = 0, aiProcessed = 0, aiFailures = 0;
  const errors = [];

  try {
    // 1. Fetch jobs from ALL sources
    log('INFO', 'Starting job fetch from all sources');

    const [usaJobs, ghJobs, lvJobs] = await Promise.allSettled([
      fetchUSAJobs(log),
      fetchGreenhouseJobs(log),
      fetchLeverJobs(log)
    ]);

    const rawJobs = [
      ...(usaJobs.status === 'fulfilled' ? usaJobs.value : []),
      ...(ghJobs.status === 'fulfilled' ? ghJobs.value : []),
      ...(lvJobs.status === 'fulfilled' ? lvJobs.value : [])
    ];

    if (usaJobs.status === 'rejected') log('ERROR', 'USAJOBS source failed: ' + usaJobs.reason?.message);
    if (ghJobs.status === 'rejected') log('ERROR', 'Greenhouse source failed: ' + ghJobs.reason?.message);
    if (lvJobs.status === 'rejected') log('ERROR', 'Lever source failed: ' + lvJobs.reason?.message);

    fetched = rawJobs.length;
    log('INFO', `Total from all sources: ${fetched} jobs`);

    // 2. Process each job
    for (const job of rawJobs) {
      try {
        // Check duplicate by hash
        const exists = await existsByHash(job.job_hash);
        if (exists) {
          duplicates++;
          continue;
        }

        // Run rule-based classification
        const classification = classifyJob(job);

        // If rules are confident, use them directly
        if (!classification.needs_ai) {
          const fullJob = { ...job, ...classification };
          delete fullJob.needs_ai;
          await upsertJob(fullJob);
          inserted++;
          continue;
        }

        // For ambiguous jobs: skip AI to stay within timeout, use partial rules
        const fullJob = { ...job, ...classification, classification_method: 'RULE_PARTIAL' };
        delete fullJob.needs_ai;
        await upsertJob(fullJob);
        inserted++;
      } catch (e) {
        errors.push(`${job.title}: ${e.message}`);
        log('ERROR', `Processing failed: ${e.message}`);
      }
    }

    // 3. Cleanup old jobs
    const cleaned = await cleanupOldJobs(RETENTION_DAYS);
    if (cleaned > 0) log('INFO', `Cleaned up ${cleaned} old jobs`);

    // 4. Log the run
    const duration = Date.now() - startTime;
    await logCronRun({
      status: 'success',
      fetched, inserted, duplicates,
      ai_processed: aiProcessed,
      ai_failures: aiFailures,
      errors: errors.length ? errors.slice(0, 10) : null,
      duration_ms: duration
    });

    log('INFO', `Done in ${duration}ms: ${fetched} fetched, ${inserted} inserted, ${duplicates} duplicates`);

    return res.status(200).json({
      success: true,
      fetched, inserted, duplicates,
      ai_processed: aiProcessed,
      ai_failures: aiFailures,
      errors_count: errors.length,
      duration_ms: duration,
      logs
    });

  } catch (e) {
    const duration = Date.now() - startTime;
    log('ERROR', `Cron failed: ${e.message}`);

    await logCronRun({
      status: 'error',
      fetched, inserted, duplicates,
      ai_processed: aiProcessed,
      ai_failures: aiFailures,
      errors: [e.message],
      duration_ms: duration
    }).catch(() => {});

    return res.status(500).json({ error: e.message, logs });
  }
}

// ── INDIA STATS ──────────────────────────────────────────────────────────────
async function handleIndiaStats(req, res) {
  if (!isOwner(req)) return res.status(403).json({ error: 'Access denied' });
  const stats = await getIndiaStats();
  return res.status(200).json(stats);
}

// ── INDIA CRON ───────────────────────────────────────────────────────────────
async function handleIndiaCron(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers['authorization'];
  if (cronSecret && authHeader === 'Bearer ' + cronSecret) { /* ok */ }
  else if (isOwner(req)) { /* ok */ }
  else { return res.status(403).json({ error: 'Unauthorized' }); }

  const startTime = Date.now();
  const logs = [];
  const log = (level, msg) => {
    logs.push({ time: new Date().toISOString(), level, msg });
    console.log(`[india-cron] ${level}: ${msg}`);
  };

  let fetched = 0, inserted = 0, duplicates = 0, errors = [];

  try {
    log('INFO', 'Starting India jobs fetch from all sources');

    // Fetch from both sources in parallel
    const [ghResult, indeedResult] = await Promise.allSettled([
      fetchIndiaGreenhouseJobs(log),
      fetchIndeedIndiaJobs(log)
    ]);

    const rawJobs = [
      ...(ghResult.status === 'fulfilled' ? ghResult.value : []),
      ...(indeedResult.status === 'fulfilled' ? indeedResult.value : [])
    ];

    if (ghResult.status === 'rejected') log('ERROR', 'India GH failed: ' + ghResult.reason?.message);
    if (indeedResult.status === 'rejected') log('ERROR', 'Indeed failed: ' + indeedResult.reason?.message);

    fetched = rawJobs.length;
    log('INFO', `Total India jobs: ${fetched}`);

    for (const job of rawJobs) {
      try {
        const exists = await existsByHash(job.job_hash);
        if (exists) { duplicates++; continue; }

        const classification = classifyJob(job);
        const fullJob = { ...job, ...classification };
        delete fullJob.needs_ai;
        delete fullJob.is_fresher;
        await upsertJob(fullJob);
        inserted++;
      } catch (e) {
        errors.push(`${job.title}: ${e.message}`);
        log('ERROR', `Processing failed: ${e.message}`);
      }
    }

    const cleaned = await cleanupOldJobs(RETENTION_DAYS, 'IN');
    if (cleaned > 0) log('INFO', `Cleaned up ${cleaned} old India jobs`);

    const duration = Date.now() - startTime;
    log('INFO', `India done in ${duration}ms: ${fetched} fetched, ${inserted} inserted, ${duplicates} duplicates`);

    return res.status(200).json({
      success: true, fetched, inserted, duplicates,
      errors_count: errors.length, duration_ms: duration, logs
    });

  } catch (e) {
    log('ERROR', `India cron failed: ${e.message}`);
    return res.status(500).json({ error: e.message, logs });
  }
}
