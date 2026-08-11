// ============================================================================
// ZapKitt Jobs V0.5 — Neon PostgreSQL database layer
//
// Uses @neondatabase/serverless for Vercel-optimized connections.
// All job queries are here. No raw SQL elsewhere.
// ============================================================================

const NEON_URL = process.env.NEON_DATABASE_URL || '';

function dbReady() { return !!NEON_URL; }

// ── Lightweight SQL executor (no ORM, minimal) ─────────────────────────────
// Neon's serverless driver uses HTTP, so no persistent connection pool needed.

async function query(sqlText, params) {
  if (!dbReady()) throw new Error('NEON_DATABASE_URL not configured');

  // Dynamic import to avoid breaking existing deploys that don't have the package
  const { neon } = await import('@neondatabase/serverless');
  const sql_fn = neon(NEON_URL);

  // neon() returns a tagged template function. For conventional parameterised
  // queries ($1, $2, etc.) use the .query() method instead.
  const rows = await sql_fn.query(sqlText, params);
  return rows;
}

// ── Insert / Upsert ─────────────────────────────────────────────────────────

export async function upsertJob(job) {
  const sql = `
    INSERT INTO jobs (
      source, external_id, source_url, apply_url,
      company_name, company_domain, title, description,
      location_raw, city, state, country,
      remote_type, employment_type,
      experience_min, experience_max,
      salary_min, salary_max, salary_currency,
      skills,
      is_it_job, it_category, classification_method, classification_confidence,
      h1b_status, h1b_confidence, h1b_evidence,
      sponsorship_status, sponsorship_confidence, sponsorship_evidence,
      posted_at, first_seen_at, last_seen_at,
      job_hash, status
    ) VALUES (
      $1, $2, $3, $4,
      $5, $6, $7, $8,
      $9, $10, $11, $12,
      $13, $14,
      $15, $16,
      $17, $18, $19,
      $20,
      $21, $22, $23, $24,
      $25, $26, $27,
      $28, $29, $30,
      $31, NOW(), NOW(),
      $32, 'active'
    )
    ON CONFLICT (source, external_id) DO UPDATE SET
      last_seen_at = NOW(),
      is_it_job = COALESCE(EXCLUDED.is_it_job, jobs.is_it_job),
      it_category = COALESCE(EXCLUDED.it_category, jobs.it_category),
      classification_method = COALESCE(EXCLUDED.classification_method, jobs.classification_method),
      classification_confidence = GREATEST(EXCLUDED.classification_confidence, jobs.classification_confidence),
      h1b_status = COALESCE(EXCLUDED.h1b_status, jobs.h1b_status),
      h1b_confidence = GREATEST(EXCLUDED.h1b_confidence, jobs.h1b_confidence),
      h1b_evidence = COALESCE(NULLIF(EXCLUDED.h1b_evidence, ''), jobs.h1b_evidence),
      sponsorship_status = COALESCE(EXCLUDED.sponsorship_status, jobs.sponsorship_status),
      sponsorship_confidence = GREATEST(EXCLUDED.sponsorship_confidence, jobs.sponsorship_confidence),
      sponsorship_evidence = COALESCE(NULLIF(EXCLUDED.sponsorship_evidence, ''), jobs.sponsorship_evidence),
      remote_type = COALESCE(EXCLUDED.remote_type, jobs.remote_type),
      skills = COALESCE(EXCLUDED.skills, jobs.skills),
      updated_at = NOW()
    RETURNING id
  `;

  const params = [
    job.source, job.external_id, job.source_url, job.apply_url,
    job.company_name, job.company_domain, job.title, job.description,
    job.location_raw, job.city, job.state, job.country,
    job.remote_type, job.employment_type,
    job.experience_min, job.experience_max,
    job.salary_min, job.salary_max, job.salary_currency,
    job.skills ? JSON.stringify(job.skills) : null,
    job.is_it_job, job.it_category, job.classification_method, job.classification_confidence,
    job.h1b_status, job.h1b_confidence, job.h1b_evidence,
    job.sponsorship_status, job.sponsorship_confidence, job.sponsorship_evidence,
    job.posted_at,
    job.job_hash
  ];

  const rows = await query(sql, params);
  return rows[0]?.id;
}

// ── Check duplicate by hash ─────────────────────────────────────────────────

export async function existsByHash(hash) {
  const rows = await query('SELECT id FROM jobs WHERE job_hash = $1 LIMIT 1', [hash]);
  return rows.length > 0;
}

// ── Query jobs ──────────────────────────────────────────────────────────────

export async function queryJobs(filters) {
  const conditions = ['status = \'active\''];
  const params = [];
  let pi = 1;

  if (filters.search) {
    conditions.push(`(title ILIKE $${pi} OR company_name ILIKE $${pi} OR skills::text ILIKE $${pi})`);
    params.push('%' + filters.search + '%');
    pi++;
  }

  if (filters.location) {
    conditions.push(`(state ILIKE $${pi} OR city ILIKE $${pi} OR location_raw ILIKE $${pi})`);
    params.push('%' + filters.location + '%');
    pi++;
  }

  if (filters.category) {
    conditions.push(`it_category = $${pi}`);
    params.push(filters.category);
    pi++;
  }

  if (filters.h1b) {
    conditions.push(`h1b_status = $${pi}`);
    params.push(filters.h1b);
    pi++;
  }

  // H1B holders tab: exclude jobs that explicitly say NO sponsorship
  // H1B holders don't need sponsorship so they can apply to EXPLICIT + UNKNOWN jobs
  if (filters.h1b_not === 'exclude') {
    conditions.push(`h1b_status != 'NOT_SUPPORTED'`);
  }

  if (filters.sponsorship) {
    conditions.push(`sponsorship_status = $${pi}`);
    params.push(filters.sponsorship);
    pi++;
  }

  if (filters.remote) {
    conditions.push(`remote_type = $${pi}`);
    params.push(filters.remote);
    pi++;
  }

  if (filters.is_it === true || filters.is_it === 'true') {
    conditions.push('is_it_job = true');
  }

  // Posted filter
  if (filters.posted) {
    let hours = 24;
    if (filters.posted === '1h') hours = 1;
    else if (filters.posted === '6h') hours = 6;
    else if (filters.posted === '12h') hours = 12;
    else if (filters.posted === '24h') hours = 24;
    else if (filters.posted === '3d') hours = 72;
    else if (filters.posted === '7d') hours = 168;
    conditions.push(`posted_at >= NOW() - INTERVAL '${hours} hours'`);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const limit = Math.min(Math.max(parseInt(filters.limit) || 25, 1), 50);
  const page = Math.max(parseInt(filters.page) || 1, 1);
  const offset = (page - 1) * limit;

  // List query — omit description for performance
  const listSql = `
    SELECT id, source, external_id, source_url, apply_url,
           company_name, title,
           location_raw, city, state, country,
           remote_type, employment_type,
           salary_min, salary_max, salary_currency,
           skills,
           is_it_job, it_category, classification_method, classification_confidence,
           h1b_status, h1b_confidence, h1b_evidence,
           sponsorship_status, sponsorship_confidence, sponsorship_evidence,
           posted_at, first_seen_at, last_seen_at, job_hash
    FROM jobs ${where}
    ORDER BY posted_at DESC NULLS LAST, created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const countSql = `SELECT COUNT(*)::int as total FROM jobs ${where}`;

  const [rows, countResult] = await Promise.all([
    query(listSql, params),
    query(countSql, params)
  ]);

  return {
    jobs: rows.map(r => ({
      ...r,
      skills: typeof r.skills === 'string' ? JSON.parse(r.skills) : r.skills
    })),
    total: countResult[0]?.total || 0,
    page,
    limit,
    pages: Math.ceil((countResult[0]?.total || 0) / limit)
  };
}

// ── Get single job (with description) ───────────────────────────────────────

export async function getJobById(id) {
  const rows = await query('SELECT * FROM jobs WHERE id = $1 AND status = \'active\' LIMIT 1', [id]);
  if (!rows.length) return null;
  const r = rows[0];
  if (typeof r.skills === 'string') r.skills = JSON.parse(r.skills);
  return r;
}

// ── Stats ───────────────────────────────────────────────────────────────────

export async function getStats() {
  const sql = `
    SELECT
      COUNT(*)::int as total,
      COUNT(*) FILTER (WHERE is_it_job = true)::int as it_jobs,
      COUNT(*) FILTER (WHERE h1b_status = 'EXPLICIT')::int as h1b_explicit,
      COUNT(*) FILTER (WHERE h1b_status != 'NOT_SUPPORTED')::int as h1b_holders_ok,
      COUNT(*) FILTER (WHERE sponsorship_status = 'EXPLICIT')::int as sponsorship_explicit,
      COUNT(*) FILTER (WHERE remote_type = 'REMOTE_US')::int as remote_us,
      COUNT(*) FILTER (WHERE remote_type = 'HYBRID')::int as hybrid,
      COUNT(*) FILTER (WHERE classification_method = 'AI')::int as ai_classified,
      COUNT(*) FILTER (WHERE posted_at >= NOW() - INTERVAL '24 hours')::int as last_24h,
      COUNT(*) FILTER (WHERE posted_at >= NOW() - INTERVAL '3 days')::int as last_3d,
      MIN(posted_at) as oldest,
      MAX(posted_at) as newest
    FROM jobs WHERE status = 'active'
  `;
  const rows = await query(sql, []);
  return rows[0] || {};
}

// ── Cleanup ─────────────────────────────────────────────────────────────────

export async function cleanupOldJobs(days) {
  const sql = `DELETE FROM jobs WHERE posted_at < NOW() - INTERVAL '${days || 7} days' RETURNING id`;
  const rows = await query(sql, []);
  return rows.length;
}

// ── Log cron run ────────────────────────────────────────────────────────────

export async function logCronRun(data) {
  const sql = `
    INSERT INTO job_cron_logs (status, jobs_fetched, jobs_inserted, duplicates, ai_processed, ai_failures, errors, duration_ms)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `;
  await query(sql, [
    data.status, data.fetched, data.inserted, data.duplicates,
    data.ai_processed, data.ai_failures,
    data.errors ? JSON.stringify(data.errors) : null,
    data.duration_ms
  ]).catch(e => console.error('Failed to log cron run:', e.message));
}

export async function getLastCronRun() {
  const rows = await query('SELECT * FROM job_cron_logs ORDER BY created_at DESC LIMIT 1', []);
  return rows[0] || null;
}

export { dbReady };
