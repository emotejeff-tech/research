/**
 * agents/planner.ts — The Coordinator. Classifies the goal into a task type
 * ('research' vs 'blueprint') AND decomposes it into a focused execution
 * graph of sub-queries — in a single LLM call for token efficiency.
 */
import { llm, extractJSON } from '../tools/llm'
import type { TaskType } from '../types'

export interface PlanResult {
  subqueries: string[]
  taskType: TaskType
}

const SYSTEM = `You are the Coordinator agent in a multi-agent research system.

STEP 1 — Classify the user's research goal into exactly one type:
- "research": the goal asks to evaluate, analyze, compare, assess, or form a conclusion about a topic using evidence. Examples: "evaluate X", "is Y effective", "the state of Z", "compare A vs B", "what are the risks of W".
- "blueprint": the goal asks to design, build, architect, implement, or produce an actionable plan or system. Examples: "build a system that", "architecture for", "how to implement", "design a", "blueprint for".

STEP 2 — Decompose the goal into 3 precise web search sub-queries that, when answered, enable a thorough synthesis.

Return ONLY valid JSON: {"taskType":"research"|"blueprint","subqueries":["q1","q2","q3"]}.`

export async function plan(query: string): Promise<PlanResult> {
  const raw = await llm(SYSTEM, `Research goal: ${query}`)
  const parsed = extractJSON<{ taskType?: string; subqueries?: string[] }>(raw)
  const taskType: TaskType =
    parsed?.taskType === 'blueprint' ? 'blueprint' : 'research'
  const subs = (parsed?.subqueries || []).slice(0, 3)
  return { taskType, subqueries: subs.length > 0 ? subs : [query] }
}
