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
  | 'generation'
  | 'final'
  | 'error'

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
  startedAt: number
  finishedAt: number | null
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
  finalMeta: { iterations: number; durationMs: number; sourceCount: number } | null
  error: string | null

  log: LogEntry[]
  plugins: Plugin[]
  history: HistoryItem[]

  // actions
  init: () => void
  startResearch: (query: string) => void
  reset: () => void
}

let socket: Socket | null = null
let initialized = false

const PHASE_LABELS: Record<Phase, string> = {
  idle: 'Standby',
  planning: 'Coordinator',
  discovery: 'Discovery',
  synthesis: 'Synthesis',
  critique: 'Critic',
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
  error: null,
  log: [],
  plugins: [],
  history: [],

  init: () => {
    if (initialized) return
    initialized = true
    socket = io('/?XTransformPort=3003', {
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1200,
      timeout: 12000,
    })

    socket.on('connect', () => {
      set({ connected: true })
      socket?.emit('plugins:request', {})
      socket?.emit('history:request', {})
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
        finalMeta: {
          iterations: d.iterations,
          durationMs: d.durationMs,
          sourceCount: d.sources?.length || 0,
        },
        log: [
          ...s.log,
          {
            id: uid(),
            ts: Date.now(),
            kind: 'final',
            text: `Research complete in ${(d.durationMs / 1000).toFixed(1)}s · ${d.iterations} critique iteration(s).`,
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
      error: null,
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
      error: null,
      log: [],
    })
  },
}))

export { PHASE_LABELS }
