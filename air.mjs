import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
export const stateDir = process.env.DUCK_STATE_DIR || join(import.meta.dirname, '.duck-state')
function setting(name, fallback, max) {
  const n = Number(process.env[name] ?? fallback)
  if (!Number.isSafeInteger(n) || n < 1 || n > max) throw new Error(`Invalid ${name}`)
  return n
}
export const limits = {
  daily: setting('DUCK_DAILY_CALL_LIMIT', 200, 10000),
  perMinute: setting('DUCK_VISITOR_CALLS_PER_MINUTE', 12, 120),
  requestBytes: setting('DUCK_REQUEST_MAX_BYTES', 24576, 80000),
  responseBytes: setting('DUCK_RESPONSE_MAX_BYTES', 65536, 262144),
  maxTokens: setting('DUCK_MAX_TOKENS', 500, 2000),
  maxAirMinutes: setting('DUCK_MAX_AIR_MINUTES', 120, 1440),
}
export class GateError extends Error { constructor(message, status = 503) { super(message); this.status = status } }
let db
function database() {
  if (!db) {
    mkdirSync(stateDir, { recursive: true, mode: 0o700 })
    const opened = new DatabaseSync(join(stateDir, 'air.sqlite'))
    opened.exec(`PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS air (id INTEGER PRIMARY KEY CHECK(id=1), ends INTEGER NOT NULL);
      INSERT OR IGNORE INTO air VALUES (1,0);
      CREATE TABLE IF NOT EXISTS ceilings (day TEXT PRIMARY KEY, ceiling INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS daily (day TEXT PRIMARY KEY, calls INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS visitor (ip TEXT NOT NULL, at INTEGER NOT NULL);`)
    db = opened
  }
  return db
}
const day = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Krasnoyarsk', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date())
function snapshot(d) {
  const ends = d.prepare('SELECT ends FROM air WHERE id=1').get()?.ends
  if (!Number.isSafeInteger(ends) || ends < 0) throw new Error('Unreadable air state')
  const calls = d.prepare('SELECT calls FROM daily WHERE day=?').get(day())?.calls ?? 0
  if (!Number.isSafeInteger(calls) || calls < 0) throw new Error('Unreadable call count')
  const ceiling = d.prepare('SELECT ceiling FROM ceilings WHERE day=?').get(day())?.ceiling ?? limits.daily
  if (!Number.isSafeInteger(ceiling) || ceiling < 1) throw new Error('Invalid limit')
  return { open: ends > Date.now(), endsAt: ends ? new Date(ends).toISOString() : null, calls, dailyLimit: Math.min(ceiling,limits.daily), day: day() }
}
export function airStatus() {
  try { return { ...snapshot(database()), readable: true } }
  catch { return { open:false, readable:false, endsAt:null } }
}
export function controlAir(minutes, dailyLimit) {
  const d = database()
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > limits.maxAirMinutes) throw new GateError('Недопустимая длительность эфира.',400)
  if (dailyLimit !== undefined) {
    if (!Number.isSafeInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > limits.daily) throw new GateError('Invalid daily limit',400)
    d.prepare('INSERT INTO ceilings VALUES (?,?) ON CONFLICT(day) DO UPDATE SET ceiling=excluded.ceiling').run(day(),dailyLimit)
  }
  d.prepare('UPDATE air SET ends=? WHERE id=1').run(minutes ? Date.now()+Math.round(minutes*60000) : 0)
  return airStatus()
}
export function reserveCall(ip) {
  let d, begun=false
  try {
    d=database(); d.exec('BEGIN IMMEDIATE'); begun=true
    const s=snapshot(d)
    if (!s.open) throw new GateError('Luna сейчас вне эфира')
    if (s.calls >= s.dailyLimit) throw new GateError('Дневной лимит вызовов исчерпан.',429)
    const hash=createHash('sha256').update(ip).digest('hex'),now=Date.now()
    d.prepare('DELETE FROM visitor WHERE at < ?').run(now-60000)
    if (d.prepare('SELECT count(*) AS n FROM visitor WHERE ip=?').get(hash).n >= limits.perMinute) throw new GateError('Слишком часто. Повтори чуть позже.',429)
    d.prepare('INSERT INTO visitor VALUES (?,?)').run(hash,now)
    d.prepare('INSERT INTO daily VALUES (?,1) ON CONFLICT(day) DO UPDATE SET calls=calls+1').run(s.day)
    d.exec('COMMIT'); begun=false
  } catch(e) {
    if (begun) { try { d.exec('ROLLBACK') } catch {} }
    if (e instanceof GateError) throw e
    throw new GateError('Luna сейчас вне эфира')
  }
}
