/**
 * telemetry.ts — Autonomous improvement tracking.
 *
 * Persists one RunLog per completed orchestration to a JSONL file so the
 * agent's improvement over time survives restarts. Keeps the most recent
 * MAX logs in memory for fast serving to the frontend.
 *
 * Three improvement vectors (computed on the frontend from these fields):
 *  1. Convergence Speed  → iterations (fewer = better first draft)
 *  2. Fact Density        → sourceCount / (wordCount / 100)  (higher = denser)
 *  3. Execution Efficiency→ durationMs (lower = faster)
 */
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TELEMETRY_FILE = join(__dirname, 'telemetry.jsonl')
const MAX = 50

export interface RunLog {
  id: string
  timestamp: number
  query: string
  taskType: 'research' | 'blueprint'
  iterations: number
  sourceCount: number
  wordCount: number
  durationMs: number
  routingMode: 'primary' | 'degraded'
}

let logs: RunLog[] = []

/** Load existing telemetry from disk on startup (most recent MAX). */
export function initTelemetry() {
  try {
    if (existsSync(TELEMETRY_FILE)) {
      const raw = readFileSync(TELEMETRY_FILE, 'utf-8')
      const lines = raw.split('\n').filter((l) => l.trim().length > 0)
      const parsed: RunLog[] = []
      for (const line of lines) {
        try {
          parsed.push(JSON.parse(line) as RunLog)
        } catch {
          /* skip malformed line */
        }
      }
      // keep chronological order, most recent last → take last MAX
      logs = parsed.slice(-MAX)
      console.log(
        `[telemetry] loaded ${logs.length} historical run(s) from ${TELEMETRY_FILE}`,
      )
    } else {
      console.log(`[telemetry] no existing log file, starting fresh`)
    }
  } catch (e) {
    console.error('[telemetry] failed to load:', (e as Error).message)
  }
}

/** Append a run log to disk + memory, then return it. */
export function recordRun(log: RunLog): RunLog {
  logs.push(log)
  if (logs.length > MAX) logs = logs.slice(-MAX)
  try {
    // ensure dir exists (it does, but be safe)
    mkdirSync(dirname(TELEMETRY_FILE), { recursive: true })
    appendFileSync(TELEMETRY_FILE, JSON.stringify(log) + '\n', 'utf-8')
  } catch (e) {
    console.error('[telemetry] failed to persist:', (e as Error).message)
  }
  return log
}

/** Return a copy of the in-memory logs (chronological, oldest→newest). */
export function getLogs(): RunLog[] {
  return [...logs]
}

/** Wipe telemetry (disk + memory) — used by the clear endpoint. */
export function clearLogs() {
  logs = []
  try {
    writeFileSync(TELEMETRY_FILE, '', 'utf-8')
  } catch (e) {
    console.error('[telemetry] failed to clear:', (e as Error).message)
  }
}
