/**
 * agents/swarm_planner.ts — Swarm Mode (Parallel Planners).
 *
 * For blueprint tasks, the Coordinator spawns three independent Planners
 * to tackle the architecture simultaneously from different angles:
 * Security, Performance, and UX. Their DAGs are merged at the end.
 */
import { llm, extractJSON } from '../tools/llm'

interface SwarmBranch {
  angle: string
  subqueries: string[]
}

const ANGLES = [
  { name: 'Security', focus: 'security, threat modeling, authentication, data protection, attack surface' },
  { name: 'Performance', focus: 'performance, scalability, latency, throughput, resource efficiency, caching' },
  { name: 'UX', focus: 'user experience, developer experience, usability, accessibility, ergonomics' },
]

export async function swarmPlan(query: string): Promise<SwarmBranch[]> {
  const branches: SwarmBranch[] = []

  for (const angle of ANGLES) {
    const raw = await llm(
      `You are a specialized Planner focused on ${angle.focus}. Decompose the following goal into 2 precise web search sub-queries from a ${angle.name} perspective. Return ONLY JSON: {"subqueries":["q1","q2"]}.`,
      `Goal: ${query}`,
    )
    const parsed = extractJSON<{ subqueries?: string[] }>(raw)
    branches.push({
      angle: angle.name,
      subqueries: (parsed?.subqueries || []).slice(0, 2),
    })
  }

  return branches
}

/**
 * Dynamic Agent Spawning: author a specialized system prompt for a
 * one-off agent tailored to the query domain.
 */
export async function spawnSpecialistAgent(query: string, domain: string): Promise<string> {
  const raw = await llm(
    `You are an Agent Spawner. Given a research query and its detected domain, write a concise, specialized system prompt for a one-off expert agent tailored to this exact topic. The prompt should make the agent an authority on this specific domain. Return ONLY the system prompt text (no JSON).`,
    `Query: ${query}\nDomain: ${domain}\n\nWrite the specialist system prompt:`,
  )
  return raw.slice(0, 500)
}
