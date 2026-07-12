'use client'

import { create } from 'zustand'
import { io, type Socket } from 'socket.io-client'

// ---------- Types (mirror the mini-service contract) ----------
export type Phase =
  | 'idle'
  | 'planning'
  | 'discovery'
  | 'synthesis'
  | 'critique'
  | 'reflection'
  | 'generation'
  | 'final'
  | 'error'

export type TaskType = 'research' | 'blueprint' | 'upgrade'

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
  /** Self-Teaching Loop metadata. */
  gapAnalysis?: string
  testStatus?: 'passed' | 'failed' | 'patched'
  testError?: string
  executionResult?: string
  executionStatus?: 'ok' | 'error' | 'not_run'
  patched?: boolean
  /** Persistent lifecycle metadata (survives restarts via registry.json). */
  usageCount?: number
  lastUsed?: number | null
  successRate?: number
}

export interface CritiqueRound {
  iteration: number
  verdict: 'pass' | 'revise'
  issues: string[]
  notes: string
}

export interface Dream {
  bestOutcome: string
  newGoals: string[]
  possibilities: string[]
  papers: { title: string; relevance: string }[]
  reflection: string
}

export interface LogEntry {
  id: string
  ts: number
  kind: 'phase' | 'thought' | 'source' | 'critique' | 'iteration' | 'plugin' | 'final' | 'error'
  agent?: string
  text: string
  meta?: any
}

export interface HistoryItem {
  id: string
  query: string
  status: string
  iterations: number
  sources: number
  finalReport: string
  routingMode: 'primary' | 'degraded'
  taskType: TaskType
  startedAt: number
  finishedAt: number | null
}

export interface RunLog {
  id: string
  timestamp: number
  query: string
  taskType: TaskType
  iterations: number
  sourceCount: number
  wordCount: number
  durationMs: number
  routingMode: 'primary' | 'degraded'
}

interface OrchestratorState {
  connected: boolean
  phase: Phase
  phaseTitle: string
  running: boolean
  activeTaskId: string | null
  query: string

  subQueries: string[]
  sources: Source[]
  draft: string
  critiqueRounds: CritiqueRound[]
  currentIteration: number
  plugin: Plugin | null
  finalReport: string
  finalMeta: {
    iterations: number
    durationMs: number
    sourceCount: number
    degraded: boolean
  } | null
  /** 'primary' = served by LLM; 'degraded' = no-LLM fallback active. */
  routingMode: 'primary' | 'degraded'
  /** Which inference tier served the run: primary cloud / local model / degraded no-LLM. */
  routingTier: 'primary' | 'local' | 'degraded'
  routingReason: string | null
  /** Detected by the Coordinator: research (independent analysis) vs blueprint (best-ideas design). */
  taskType: TaskType
  /** The Dreamer's reflection — best outcome, new goals, possibilities, papers. */
  dream: Dream | null
  error: string | null

  log: LogEntry[]
  plugins: Plugin[]
  history: HistoryItem[]
  /** Autonomous improvement telemetry — one RunLog per completed run. */
  telemetryLogs: RunLog[]
  /** Current evolution-engine stage (Self-Teaching Loop). */
  evolutionStage: { stage: string; detail?: any } | null
  /** OPSEC audit results (log scrubbing + UA rotation). */
  opsecAudits: { id: string; tool: string; itemsScrubbed: number; success: boolean; rotatedUA?: string; usageCount?: number; ts: number }[]
  /** UPGRADE mode: tool blueprints extracted from literature + compilation results. */
  upgradeStage: { stage: string; detail?: any } | null
  /** Live hardware/system telemetry from the orchestrator. */
  systemStats: {
    mem: { rss: number; heapUsed: number; heapTotal: number }
    uptime: number
    memory: { count: number; oldestTs: number | null }
    cache: { entries: number; totalHits: number }
    plugins: number
  } | null
  /** Hypothesis Engine: 3 mutually exclusive hypotheses + disproof queries. */
  hypotheses: { statement: string; disproofQuery: string }[]
  /** Saboteur: the injected poisoned source flaw (for the Critic to catch). */
  saboteurInjection: { flaw: string; flawType: string } | null
  /** Draft snapshots for timeline reversion (one per critic iteration). */
  draftSnapshots: { iteration: number; draft: string; timestamp: number }[]
  /** Meta-Prompt Evolution history. */
  metaPromptHistory: { timestamp: number; reason: string; changes: string }[]
  /** LLM provider settings. */
  llmSettings: {
    provider: string
    baseURL: string
    apiKey: string
    model: string
    enabled: boolean
  } | null
  /** Provider presets for the settings UI. */
  providerPresets: Record<string, { label: string; defaultURL: string; defaultKey: string; defaultModel: string; needsKey: boolean; help: string }> | null
  /** Available models fetched from the provider. */
  availableModels: string[]
  /** Settings modal open state. */
  settingsOpen: boolean

  // actions
  init: () => void
  startResearch: (query: string) => void
  reset: () => void
  clearTelemetry: () => void
  requestStats: () => void
  sendCritiqueOverride: (action: 'accept' | 'revise', feedback?: string) => void
  setSettingsOpen: (open: boolean) => void
  saveLLMSettings: (settings: any) => void
  fetchProviderModels: (provider: string, baseURL: string, apiKey: string) => void
}

let socket: Socket | null = null
let initialized = false

const PHASE_LABELS: Record<Phase, string> = {
  idle: 'Standby',
  planning: 'Coordinator',
  discovery: 'Discovery',
  synthesis: 'Synthesis',
  critique: 'Critic',
  reflection: 'Dreamer',
  generation: 'Evolution',
  final: 'Complete',
  error: 'Error',
}

const uid = () => Math.random().toString(36).slice(2, 10)

export const useOrchestrator = create<OrchestratorState>((set, get) => ({
  connected: false,
  phase: 'idle',
  phaseTitle: 'Awaiting a research goal',
  running: false,
  activeTaskId: null,
  query: '',
  subQueries: [],
  sources: [],
  draft: '',
  critiqueRounds: [],
  currentIteration: 0,
  plugin: null,
  finalReport: '',
  finalMeta: null,
  routingMode: 'primary',
  routingTier: 'primary',
  routingReason: null,
  taskType: 'research',
  dream: null,
  error: null,
  log: [],
  plugins: [],
  history: [],
  telemetryLogs: [],
  evolutionStage: null,
  opsecAudits: [],
  upgradeStage: null,
  systemStats: null,
  hypotheses: [],
  saboteurInjection: null,
  draftSnapshots: [],
  metaPromptHistory: [],
  llmSettings: null,
  providerPresets: null,
  availableModels: [],
  settingsOpen: false,

  init: () => {
    if (initialized) return
    initialized = true

    // Detect environment: behind Caddy gateway (port 81) vs direct (Windows/no proxy).
    // When behind Caddy, use the XTransformPort query param so Caddy routes to :3003.
    // When running directly (e.g. localhost:3000 on Windows), connect to :3003 explicitly.
    const isBehindCaddy =
      typeof window !== 'undefined' &&
      (window.location.port === '81' ||
        window.location.hostname.endsWith('.space-z.ai') ||
        window.location.search.includes('XTransformPort'))

    const socketUrl = isBehindCaddy ? '/' : 'http://localhost:3003'
    const socketOpts = isBehindCaddy
      ? { transports: ['websocket', 'polling'], forceNew: true, reconnection: true, reconnectionAttempts: 10, reconnectionDelay: 1200, timeout: 12000 }
      : { transports: ['websocket', 'polling'], forceNew: true, reconnection: true, reconnectionAttempts: 10, reconnectionDelay: 1200, timeout: 12000, cors: { origin: '*' } }

    socket = io(isBehindCaddy ? '/?XTransformPort=3003' : 'http://localhost:3003', socketOpts)

    socket.on('connect', () => {
      set({ connected: true })
      socket?.emit('plugins:request', {})
      socket?.emit('history:request', {})
      socket?.emit('telemetry:request', {})
      socket?.emit('stats:request', {})
      socket?.emit('metaPrompt:request', {})
    })
    socket.on('disconnect', () => set({ connected: false }))

    socket.on('research:phase', (d: any) => {
      set((s) => ({
        phase: d.phase as Phase,
        phaseTitle: d.title || PHASE_LABELS[d.phase as Phase] || '',
        log: [
          ...s.log,
          { id: uid(), ts: Date.now(), kind: 'phase', text: d.title || PHASE_LABELS[d.phase as Phase] || '' },
        ],
      }))
    })

    socket.on('research:thought', (d: any) => {
      set((s) => ({
        log: [
          ...s.log,
          { id: uid(), ts: Date.now(), kind: 'thought', agent: d.agent, text: d.text, meta: d.meta },
        ],
        subQueries:
          d.meta?.subqueries && Array.isArray(d.meta.subqueries)
            ? d.meta.subqueries
            : s.subQueries,
      }))
    })

    socket.on('research:source', (d: any) => {
      set((s) => ({
        sources: [...s.sources, d.source as Source],
        log: [
          ...s.log,
          {
            id: uid(),
            ts: Date.now(),
            kind: 'source',
            text: `Found: ${d.source.title}`,
            meta: { host: d.source.host, url: d.source.url },
          },
        ],
      }))
    })

    socket.on('research:iteration', (d: any) => {
      set({ currentIteration: d.iteration })
    })

    socket.on('research:critique', (d: any) => {
      set((s) => ({
        critiqueRounds: [...s.critiqueRounds, d.round as CritiqueRound],
        log: [
          ...s.log,
          {
            id: uid(),
            ts: Date.now(),
            kind: 'critique',
            text: `Iteration ${d.round.iteration}: ${d.round.verdict.toUpperCase()} — ${
              d.round.issues?.length || 0
            } issue(s)`,
            meta: d.round,
          },
        ],
      }))
    })

    socket.on('research:plugin', (d: any) => {
      set((s) => ({
        plugin: d.plugin as Plugin,
        plugins: [d.plugin as Plugin, ...s.plugins.filter((p) => p.id !== d.plugin.id)],
        log: [
          ...s.log,
          {
            id: uid(),
            ts: Date.now(),
            kind: 'plugin',
            text: `Plugin registered: ${d.plugin.name}`,
            meta: { name: d.plugin.name },
          },
        ],
      }))
    })

    socket.on('research:evolution', (d: any) => {
      set({ evolutionStage: { stage: d.stage, detail: d.detail } })
    })

    socket.on('research:dream', (d: any) => {
      if (d?.dream) {
        set({ dream: d.dream as Dream })
      }
    })

    socket.on('research:opsec', (d: any) => {
      set((s) => ({
        opsecAudits: [...s.opsecAudits, {
          id: uid(),
          tool: d.tool,
          itemsScrubbed: d.itemsScrubbed || 0,
          success: d.success,
          rotatedUA: d.rotatedUA,
          usageCount: d.usageCount,
          ts: Date.now(),
        }],
      }))
    })

    socket.on('research:upgrade', (d: any) => {
      set({ upgradeStage: { stage: d.stage, detail: d.detail } })
    })

    socket.on('stats:update', (d: any) => {
      set({ systemStats: d })
    })

    socket.on('research:hypotheses', (d: any) => {
      set({ hypotheses: (d.hypotheses || []) as { statement: string; disproofQuery: string }[] })
    })

    socket.on('research:saboteur', (d: any) => {
      set({ saboteurInjection: { flaw: d.flaw, flawType: d.flawType } })
    })

    socket.on('research:snapshot', (d: any) => {
      set((s) => ({
        draftSnapshots: [...s.draftSnapshots, { iteration: d.iteration, draft: d.draft, timestamp: d.timestamp }],
      }))
    })

    socket.on('research:metaPrompt', (d: any) => {
      if (d?.history) {
        set({ metaPromptHistory: d.history as { timestamp: number; reason: string; changes: string }[] })
      }
    })

    socket.on('settings:update', (d: any) => {
      set({
        llmSettings: d.settings || null,
        providerPresets: d.presets || null,
      })
    })

    socket.on('settings:models', (d: any) => {
      set({ availableModels: d.models || [] })
    })

    socket.on('research:routing', (d: any) => {
      set((s) => ({
        routingMode: d.mode as 'primary' | 'degraded',
        routingTier: (d.tier as 'primary' | 'local' | 'degraded') || (d.mode === 'degraded' ? 'degraded' : 'primary'),
        routingReason: d.reason || null,
        log: [
          ...s.log,
          {
            id: uid(),
            ts: Date.now(),
            kind: 'thought',
            agent: 'Router',
            text: `Model routing → ${d.tier || d.mode}${d.reason ? ` (${d.reason})` : ''}`,
          },
        ],
      }))
    })

    socket.on('research:taskType', (d: any) => {
      set({ taskType: (d.taskType as TaskType) || 'research' })
    })

    socket.on('research:final', (d: any) => {
      set((s) => ({
        running: false,
        phase: 'final',
        phaseTitle: 'Research complete',
        finalReport: d.finalReport,
        draft: d.finalReport,
        plugin: d.plugin,
        sources: d.sources,
        critiqueRounds: d.critiqueRounds,
        currentIteration: d.iterations,
        routingMode: (d.routingMode as 'primary' | 'degraded') || 'primary',
        taskType: (d.taskType as TaskType) || 'research',
        finalMeta: {
          iterations: d.iterations,
          durationMs: d.durationMs,
          sourceCount: d.sources?.length || 0,
          degraded: !!d.degraded,
        },
        log: [
          ...s.log,
          {
            id: uid(),
            ts: Date.now(),
            kind: 'final',
            text: `Research complete in ${(d.durationMs / 1000).toFixed(1)}s · ${d.iterations} critique iteration(s)${
              d.degraded ? ' · degraded mode' : ''
            }.`,
          },
        ],
      }))
      // refresh history
      socket?.emit('history:request', {})
      socket?.emit('plugins:request', {})
    })

    socket.on('research:error', (d: any) => {
      set((s) => ({
        running: false,
        phase: 'error',
        error: d.message || 'Unknown error',
        log: [
          ...s.log,
          { id: uid(), ts: Date.now(), kind: 'error', text: `Error: ${d.message || 'unknown'}` },
        ],
      }))
    })

    socket.on('plugins:list', (d: any) => {
      set({ plugins: (d.plugins || []) as Plugin[] })
    })

    socket.on('history:list', (d: any) => {
      set({ history: (d.history || []) as HistoryItem[] })
    })

    socket.on('telemetry:history', (d: any) => {
      set({ telemetryLogs: (d.logs || []) as RunLog[] })
    })

    socket.on('telemetry:update', (d: any) => {
      if (!d?.log) return
      set((s) => ({ telemetryLogs: [...s.telemetryLogs, d.log as RunLog].slice(-50) }))
    })
  },

  startResearch: (query: string) => {
    const q = query.trim()
    if (!q || !socket) return
    set({
      running: true,
      phase: 'planning',
      phaseTitle: 'Coordinator: decomposing query',
      activeTaskId: null,
      query: q,
      subQueries: [],
      sources: [],
      draft: '',
      critiqueRounds: [],
      currentIteration: 0,
      plugin: null,
      finalReport: '',
      finalMeta: null,
      routingMode: 'primary',
      routingTier: 'primary',
      routingReason: null,
      taskType: 'research',
      dream: null,
      error: null,
      evolutionStage: null,
      opsecAudits: [],
      hypotheses: [],
      saboteurInjection: null,
      draftSnapshots: [],
      log: [
        {
          id: uid(),
          ts: Date.now(),
          kind: 'phase',
          text: `New research goal: "${q}"`,
        },
      ],
    })
    socket.emit('research:start', { query: q })
  },

  reset: () => {
    set({
      phase: 'idle',
      phaseTitle: 'Awaiting a research goal',
      running: false,
      activeTaskId: null,
      query: '',
      subQueries: [],
      sources: [],
      draft: '',
      critiqueRounds: [],
      currentIteration: 0,
      plugin: null,
      finalReport: '',
      finalMeta: null,
      routingMode: 'primary',
      routingTier: 'primary',
      routingReason: null,
      taskType: 'research',
      dream: null,
      error: null,
      evolutionStage: null,
      opsecAudits: [],
      hypotheses: [],
      saboteurInjection: null,
      draftSnapshots: [],
      log: [],
    })
  },

  clearTelemetry: () => {
    socket?.emit('telemetry:clear', {})
  },

  requestStats: () => {
    socket?.emit('stats:request', {})
  },

  sendCritiqueOverride: (action: 'accept' | 'revise', feedback?: string) => {
    socket?.emit('critique:override', { action, feedback })
  },

  setSettingsOpen: (open: boolean) => {
    set({ settingsOpen: open })
    if (open) socket?.emit('settings:get', {})
  },

  saveLLMSettings: (settings: any) => {
    socket?.emit('settings:save', { settings })
  },

  fetchProviderModels: (provider: string, baseURL: string, apiKey: string) => {
    set({ availableModels: [] })
    socket?.emit('settings:fetchModels', { provider, baseURL, apiKey })
  },
}))

export { PHASE_LABELS }
