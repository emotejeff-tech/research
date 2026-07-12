/**
 * Shared types for the research orchestrator (mirrored by the frontend store).
 */

export type Phase =
  | 'planning'
  | 'discovery'
  | 'synthesis'
  | 'critique'
  | 'generation'
  | 'final'

/**
 * How the engine treats a goal.
 * - 'research': evaluate/analyze/compare → strict independent-analyst synthesis.
 * - 'blueprint': design/build/architect → best-ideas actionable blueprint.
 * Detected by the Coordinator during planning.
 */
export type TaskType = 'research' | 'blueprint'

export interface Source {
  id: string
  query: string
  title: string
  url: string
  snippet: string
  host: string
}

export interface Plugin {
  id: string
  name: string
  description: string
  language: string
  code: string
  createdAt: number
}

export interface CritiqueRound {
  iteration: number
  verdict: 'pass' | 'revise'
  issues: string[]
  notes: string
}

export interface LLMResult {
  content: string
  /** 'primary' = served by the language model; 'degraded' = no-LLM fallback. */
  mode: 'primary' | 'degraded'
}

export type Emit = (event: string, payload: any) => void

export interface TaskState {
  id: string
  query: string
  status: 'running' | 'completed' | 'error'
  phase: Phase
  taskType: TaskType
  subQueries: string[]
  sources: Source[]
  draft: string
  plugin: Plugin | null
  critiqueRounds: CritiqueRound[]
  finalReport: string
  routingMode: 'primary' | 'degraded'
  startedAt: number
  finishedAt: number | null
  error: string | null
}
