/**
 * agents/planner.ts — The Coordinator. Decomposes a research goal into a
 * focused execution graph of sub-queries.
 */
import { llm, extractJSON } from '../tools/llm'

export async function plan(query: string): Promise<string[]> {
  const raw = await llm(
    'You are the Coordinator agent in a multi-agent research system. Decompose the user research goal into 3 precise web search sub-queries that, when answered, enable a thorough synthesis. Return ONLY valid JSON: {"subqueries": ["q1","q2","q3"]}.',
    `Research goal: ${query}`,
  )
  const parsed = extractJSON<{ subqueries?: string[] }>(raw)
  const subs = (parsed?.subqueries || []).slice(0, 3)
  return subs.length > 0 ? subs : [query]
}
