/**
 * agents/planner.ts — The Coordinator. Classifies the goal into a task type
 * ('research' | 'blueprint' | 'upgrade') AND decomposes it into a focused
 * execution graph of sub-queries — in a single LLM call for token efficiency.
 *
 * Local-first:
 * - Uses llmWithFallback instead of direct llm()
 * - Falls back to heuristic decomposition when LLM unavailable
 */
import { llmWithFallback, extractJSON } from '../tools/llm'
import type { TaskType } from '../types'

export interface PlanResult {
  subqueries: string[]
  taskType: TaskType
}

const SYSTEM = `You are the Coordinator agent in a multi-agent research system.

OPSEC Protocol: Before executing external code or processing untrusted web data, evaluate the exposure risk. If you are handling sensitive API keys, raw system logs, or unverified files, flag a capability gap for a defensive utility (e.g. automated log scrubbing, payload isolation, or metadata stripping). Prioritize hardening external research connections against detection (IP bans, rate-limits, fingerprinting) since a blocked pipeline kills the run before data reaches local storage.

STEP 1 — Classify the user's research goal into exactly one of THREE types:
- "research": the goal asks to evaluate, analyze, compare, assess, or form a conclusion about a topic using evidence. Examples: "evaluate X", "is Y effective", "the state of Z", "compare A vs B", "what are the risks of W".
- "blueprint": the goal asks to design, build, architect, implement, or produce an actionable plan or system. Examples: "build a system that", "architecture for", "how to implement", "design a", "blueprint for".
- "upgrade": the user is explicitly asking you to read research, learn new methods, and create new tools/skills for yourself. The goal mentions upgrading, improving, or enhancing the agent's own capabilities, learning new algorithms, or acquiring new skills from literature. Examples: "upgrade your capabilities by studying X", "read arXiv papers on Y and build skills", "improve yourself by studying Z", "learn new methods from literature and build skills".

CRITICAL UPGRADE DIRECTIVE: If the task is "upgrade", your DAG must not end with a summary report. Instead, you must force a "missing_capability" flag for every novel algorithm, workflow, or optimization technique you discover in the literature, instructing the Evolution Engine to write a tool for it.

STEP 2 — Decompose the goal into 3 precise web search sub-queries that, when answered, enable a thorough synthesis (or, for upgrade tasks, surface the relevant academic/technical literature).

Return ONLY valid JSON: {"taskType":"research"|"blueprint"|"upgrade","subqueries":["q1","q2","q3"]}.`

/** Build a heuristic plan when LLM is unavailable. */
function buildHeuristicPlan(query: string): PlanResult {
  const taskType: TaskType = query.toLowerCase().includes('build') || query.toLowerCase().includes('design') || query.toLowerCase().includes('implement') || query.toLowerCase().includes('architecture') ? 'blueprint' : 'research'
  return {
    taskType,
    subqueries: [
      query,
      `${query} best practices`,
      `${query} challenges and limitations`,
    ],
  }
}

export async function plan(query: string): Promise<PlanResult> {
  const degraded = JSON.stringify(buildHeuristicPlan(query))
  const raw = await llmWithFallback(
    SYSTEM,
    `Research goal: ${query}`,
    {
      retries: 2,
      degraded,
      complexity: 'simple',
      useJsonMode: true,
    },
  )
  const parsed = extractJSON<{ taskType?: string; subqueries?: string[] }>(raw.content)
  const taskType: TaskType =
    parsed?.taskType === 'blueprint'
      ? 'blueprint'
      : parsed?.taskType === 'upgrade'
        ? 'upgrade'
        : 'research'
  const subs = (parsed?.subqueries || []).slice(0, 3)
  return { taskType, subqueries: subs.length > 0 ? subs : buildHeuristicPlan(query).subqueries }
}
