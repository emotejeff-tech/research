/**
 * tools/meta_prompts.ts — Meta-Prompt Evolution.
 *
 * Tracks long-term success metrics and permanently rewrites the system
 * instructions of the Planner and Synthesizer agents to optimize their
 * baseline performance. Persists to meta_prompts.json so evolved prompts
 * survive restarts and compound over time.
 *
 * Every N runs, the system analyzes the telemetry: if iterations are
 * trending up (worse first drafts) or duration is trending up (slower),
 * it asks the LLM to rewrite the prompts to fix the regression. If
 * performance is improving, it reinforces the current prompt direction.
 */
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { llm, extractJSON } from './llm'
import { getLogs } from '../telemetry'

const __dirname = dirname(fileURLToPath(import.meta.url))
const META_PROMPTS_PATH = join(__dirname, '..', 'meta_prompts.json')

interface MetaPromptStore {
  plannerPrompt: string
  synthesizerPrompt: string
  criticPrompt: string
  lastEvolutionRun: number
  evolutionHistory: { timestamp: number; reason: string; changes: string }[]
}

// Default prompts (the original system prompts).
const DEFAULT_PLANNER = `You are the Coordinator agent in a multi-agent research system. Classify the goal and decompose it into 3 sub-queries. Return JSON: {"taskType":"research"|"blueprint"|"upgrade","subqueries":["q1","q2","q3"]}.`

const DEFAULT_SYNTHESIZER = `You are an independent research analyst. Form an ORIGINAL conclusion using primary data only. Strip narrative bias. Show your logic. Be definitive — no hedging.`

let store: MetaPromptStore = {
  plannerPrompt: DEFAULT_PLANNER,
  synthesizerPrompt: DEFAULT_SYNTHESIZER,
  criticPrompt: '',
  lastEvolutionRun: 0,
  evolutionHistory: [],
}

const EVOLUTION_INTERVAL_RUNS = 5 // evolve every 5 runs

/** Load evolved prompts from disk. */
export function loadMetaPrompts() {
  try {
    if (existsSync(META_PROMPTS_PATH)) {
      store = JSON.parse(readFileSync(META_PROMPTS_PATH, 'utf-8'))
      console.log(`[meta-prompts] loaded evolved prompts (${store.evolutionHistory.length} past evolutions)`)
    }
  } catch {
    store = { ...store }
  }
}

/** Get the current evolved planner prompt. */
export function getPlannerPrompt(): string {
  return store.plannerPrompt
}

/** Get the current evolved synthesizer prompt. */
export function getSynthesizerPrompt(): string {
  return store.synthesizerPrompt
}

/** Get evolution history for the frontend. */
export function getEvolutionHistory() {
  return store.evolutionHistory
}

/**
 * Analyze telemetry and potentially evolve the prompts. Called after each run.
 * Returns null if no evolution happened, or a description of the changes.
 */
export async function maybeEvolvePrompts(runCount: number): Promise<string | null> {
  // Only evolve every EVOLUTION_INTERVAL_RUNS.
  if (runCount % EVOLUTION_INTERVAL_RUNS !== 0 || runCount === 0) return null

  const logs = getLogs()
  if (logs.length < EVOLUTION_INTERVAL_RUNS) return null

  // Compare recent vs earlier performance.
  const recent = logs.slice(-EVOLUTION_INTERVAL_RUNS)
  const earlier = logs.slice(0, Math.max(0, logs.length - EVOLUTION_INTERVAL_RUNS))
  if (earlier.length === 0) return null

  const recentAvgIter = recent.reduce((s, l) => s + l.iterations, 0) / recent.length
  const earlierAvgIter = earlier.reduce((s, l) => s + l.iterations, 0) / earlier.length
  const recentAvgDur = recent.reduce((s, l) => s + l.durationMs, 0) / recent.length
  const earlierAvgDur = earlier.reduce((s, l) => s + l.durationMs, 0) / earlier.length

  const iterTrend = recentAvgIter - earlierAvgIter // positive = worse (more iterations)
  const durTrend = (recentAvgDur - earlierAvgDur) / earlierAvgDur // positive = slower

  // Only evolve if there's a meaningful regression.
  if (iterTrend <= 0 && durTrend <= 0.1) return null

  const reason = `iterations ${earlierAvgIter.toFixed(1)}→${recentAvgIter.toFixed(1)} (${iterTrend > 0 ? 'worse' : 'better'}), duration ${earlierAvgDur.toFixed(0)}ms→${recentAvgDur.toFixed(0)}ms (${(durTrend * 100).toFixed(0)}%)`

  try {
    const raw = await llm(
      `You are a Meta-Prompt Evolution engine. Analyze the performance regression and rewrite the agent system prompts to fix it.

Current Planner prompt:
${store.plannerPrompt}

Current Synthesizer prompt:
${store.synthesizerPrompt}

Performance regression: ${reason}
Recent avg iterations: ${recentAvgIter.toFixed(1)} (lower is better)
Recent avg duration: ${recentAvgDur.toFixed(0)}ms

Rewrite BOTH prompts to improve performance. If iterations are high, make the Synthesizer prompt more precise so it gets it right the first time. If duration is high, make the Planner prompt more efficient (fewer/faster sub-queries).

Return ONLY JSON: {"plannerPrompt":"...","synthesizerPrompt":"...","changes":"one sentence describing what you changed and why"}`,
      `Evolve the prompts now.`,
    )

    const parsed = extractJSON<{ plannerPrompt?: string; synthesizerPrompt?: string; changes?: string }>(raw)
    if (parsed?.plannerPrompt && parsed?.synthesizerPrompt) {
      store.plannerPrompt = parsed.plannerPrompt
      store.synthesizerPrompt = parsed.synthesizerPrompt
      store.lastEvolutionRun = runCount
      store.evolutionHistory.push({
        timestamp: Date.now(),
        reason,
        changes: parsed.changes || 'prompts rewritten',
      })
      // Cap history at 20 entries.
      if (store.evolutionHistory.length > 20) {
        store.evolutionHistory = store.evolutionHistory.slice(-20)
      }
      writeFileSync(META_PROMPTS_PATH, JSON.stringify(store, null, 2), 'utf-8')
      console.log(`[meta-prompts] evolved: ${parsed.changes}`)
      return parsed.changes || 'prompts evolved'
    }
  } catch (e) {
    console.error('[meta-prompts] evolution failed:', (e as Error).message)
  }
  return null
}
