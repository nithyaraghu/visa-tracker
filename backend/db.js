// backend/db.js
// Uses PostgreSQL in production; falls back to a local JSON file for development
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const JSON_PATH = join(__dir, 'subscribers.json')

// ── JSON file store (local dev, no DB needed) ─────────────────────
function readStore() {
  if (!existsSync(JSON_PATH)) return []
  try { return JSON.parse(readFileSync(JSON_PATH, 'utf8')) } catch { return [] }
}
function writeStore(data) {
  writeFileSync(JSON_PATH, JSON.stringify(data, null, 2))
}

// ── PostgreSQL (production) ───────────────────────────────────────
let pool = null
async function getPool() {
  if (pool) return pool
  if (!process.env.DATABASE_URL) return null
  try {
    const { default: pg } = await import('pg')
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
    await pool.query(`
      CREATE TABLE IF NOT EXISTS alert_subscribers (
        id           SERIAL PRIMARY KEY,
        email        TEXT NOT NULL UNIQUE,
        name         TEXT,
        visa_type    TEXT NOT NULL,
        auth_start   DATE,
        auth_end     DATE,
        employed_since DATE,
        alert_levels TEXT[] DEFAULT ARRAY['warn','urgent','critical'],
        sent_alerts  TEXT[] DEFAULT ARRAY[]::TEXT[],
        created_at   TIMESTAMPTZ DEFAULT NOW(),
        updated_at   TIMESTAMPTZ DEFAULT NOW()
      );
      -- Add unique constraint if table already exists without it
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'alert_subscribers_email_key'
        ) THEN
          ALTER TABLE alert_subscribers ADD CONSTRAINT alert_subscribers_email_key UNIQUE (email);
        END IF;
      END $$
    `)
    console.log('[db] PostgreSQL connected')
    return pool
  } catch (err) {
    console.warn('[db] PostgreSQL unavailable, using JSON fallback:', err.message)
    return null
  }
}

// ── Public API ────────────────────────────────────────────────────
export async function saveSubscriber(data) {
  const db = await getPool()
  if (db) {
    const { rows } = await db.query(`
      INSERT INTO alert_subscribers (email, name, visa_type, auth_start, auth_end, employed_since, alert_levels)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (email) DO UPDATE SET
        name=EXCLUDED.name, visa_type=EXCLUDED.visa_type,
        auth_start=EXCLUDED.auth_start, auth_end=EXCLUDED.auth_end,
        employed_since=EXCLUDED.employed_since,
        alert_levels=EXCLUDED.alert_levels,
        sent_alerts=ARRAY[]::TEXT[],
        updated_at=NOW()
      RETURNING *
    `, [data.email, data.name, data.visaType, data.authStart||null, data.authEnd||null,
        data.employedSince||null, data.alertLevels])
    return rows[0]
  }
  // JSON fallback
  const store = readStore()
  const existing = store.findIndex(s => s.email === data.email)
  const record = {
    id: existing >= 0 ? store[existing].id : Date.now(),
    email: data.email, name: data.name, visa_type: data.visaType,
    auth_start: data.authStart, auth_end: data.authEnd,
    employed_since: data.employedSince,
    alert_levels: data.alertLevels,
    sent_alerts: []
  }
  if (existing >= 0) store[existing] = record
  else store.push(record)
  writeStore(store)
  return record
}

export async function loadSubscribers() {
  const db = await getPool()
  if (db) {
    const { rows } = await db.query('SELECT * FROM alert_subscribers')
    return rows
  }
  return readStore()
}

export async function markAlertSent(id, level) {
  const db = await getPool()
  if (db) {
    await db.query(
      `UPDATE alert_subscribers SET sent_alerts = array_append(sent_alerts, $1), updated_at=NOW() WHERE id=$2`,
      [level, id]
    )
    return
  }
  const store = readStore()
  const sub = store.find(s => s.id === id)
  if (sub) {
    sub.sent_alerts = [...(sub.sent_alerts || []), level]
    writeStore(store)
  }
}