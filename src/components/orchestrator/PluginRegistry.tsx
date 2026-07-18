'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Sparkles,
  Code2,
  ChevronDown,
  Terminal,
  Clock,
  CheckCircle2,
  XCircle,
  Wrench,
  Play,
  AlertCircle,
  Search,
  FileCode,
  Brain,
} from 'lucide-react'
import { useOrchestrator, type Plugin } from '@/lib/orchestrator-store'
import { GlassCard, GlassPanelHeader } from './GlassCard'
import { usePhaseGlow } from './usePhaseGlow'

function timeAgo(ts: number) {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const TEST_BADGE = {
  passed: { icon: CheckCircle2, label: 'tested', cls: 'bg-emerald-400/15 text-emerald-300' },
  patched: { icon: Wrench, label: 'patched', cls: 'bg-amber-400/15 text-amber-300' },
  failed: { icon: XCircle, label: 'failed', cls: 'bg-rose-400/15 text-rose-300' },
} as const

const EXEC_BADGE = {
  ok: { icon: Play, label: 'ran', cls: 'bg-emerald-400/15 text-emerald-300' },
  error: { icon: AlertCircle, label: 'runtime err', cls: 'bg-rose-400/15 text-rose-300' },
  not_run: { icon: Clock, label: 'not run', cls: 'bg-white/10 text-white/40' },
} as const

function PluginCard({ plugin, fresh }: { plugin: Plugin; fresh?: boolean }) {
  const [open, setOpen] = useState(false)
  const testBadge = plugin.testStatus ? TEST_BADGE[plugin.testStatus] : null
  const execBadge = plugin.executionStatus ? EXEC_BADGE[plugin.executionStatus] : null
  return (
    <motion.div
      layout
      initial={fresh ? { opacity: 0, y: -10, scale: 0.97 } : { opacity: 0 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={`overflow-hidden rounded-xl border ${
        fresh ? 'border-orange-400/40 bg-orange-400/[0.05]' : 'border-white/10 bg-white/[0.03]'
      }`}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-400/15 text-orange-300">
            <Terminal className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate font-mono text-xs font-semibold text-white/90">
                {plugin.name}
              </span>
              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-white/50">
                {plugin.language}
              </span>
              {testBadge && (
                <span className={`flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${testBadge.cls}`}>
                  <testBadge.icon className="h-2.5 w-2.5" />
                  {testBadge.label}
                </span>
              )}
              {execBadge && execBadge.label !== 'not run' && (
                <span className={`flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${execBadge.cls}`}>
                  <execBadge.icon className="h-2.5 w-2.5" />
                  {execBadge.label}
                </span>
              )}
              {fresh && (
                <span className="rounded bg-orange-400/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-orange-300">
                  new
                </span>
              )}
            </div>
            <p className="truncate text-[11px] text-white/50">{plugin.description}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* Lifecycle stats: usage count + success rate */}
          {plugin.usageCount !== undefined && plugin.usageCount > 0 && (
            <div className="hidden items-center gap-1.5 sm:flex">
              <span
                className="flex items-center gap-0.5 rounded-md bg-white/5 px-1.5 py-0.5 text-[9px] font-medium text-white/50"
                title={`Used ${plugin.usageCount} time(s)`}
              >
                <Terminal className="h-2.5 w-2.5" />
                {plugin.usageCount}×
              </span>
              {plugin.successRate !== undefined && (
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[9px] font-medium ${
                    plugin.successRate >= 0.8
                      ? 'bg-emerald-400/10 text-emerald-300'
                      : plugin.successRate >= 0.5
                        ? 'bg-amber-400/10 text-amber-300'
                        : 'bg-rose-400/10 text-rose-300'
                  }`}
                  title={`Success rate: ${Math.round(plugin.successRate * 100)}%`}
                >
                  {Math.round(plugin.successRate * 100)}%
                </span>
              )}
            </div>
          )}
          <span className="hidden items-center gap-1 text-[10px] text-white/30 lg:flex">
            <Clock className="h-3 w-3" />
            {plugin.lastUsed ? timeAgo(plugin.lastUsed) : timeAgo(plugin.createdAt)}
          </span>
          <ChevronDown
            className={`h-4 w-4 text-white/40 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="space-y-3 border-t border-white/10 bg-black/40 p-4">
              {/* Gap analysis */}
              {plugin.gapAnalysis && (
                <div className="rounded-lg border border-sky-400/20 bg-sky-400/[0.05] p-2.5">
                  <div className="mb-0.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-sky-300">
                    <Search className="h-3 w-3" /> Gap Analysis
                  </div>
                  <p className="text-[11px] leading-snug text-sky-100/80">{plugin.gapAnalysis}</p>
                </div>
              )}
              {/* Execution result */}
              {plugin.executionResult && (
                <div
                  className={`rounded-lg border p-2.5 ${
                    plugin.executionStatus === 'ok'
                      ? 'border-emerald-400/20 bg-emerald-400/[0.05]'
                      : 'border-rose-400/20 bg-rose-400/[0.05]'
                  }`}
                >
                  <div
                    className={`mb-0.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider ${
                      plugin.executionStatus === 'ok' ? 'text-emerald-300' : 'text-rose-300'
                    }`}
                  >
                    <Play className="h-3 w-3" /> Runtime Execution
                  </div>
                  <pre className="scroll-fancy max-h-24 overflow-auto whitespace-pre-wrap text-[10px] leading-snug text-white/60">
                    {plugin.executionResult}
                  </pre>
                </div>
              )}
              {/* Code */}
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/40">
                  <FileCode className="h-3 w-3" /> Source
                </div>
                <pre className="scroll-fancy max-h-56 overflow-auto rounded-lg bg-black/50 p-3 text-[11px] leading-relaxed">
                  <code className="font-mono text-emerald-200/90">{plugin.code}</code>
                </pre>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

const STAGES = [
  { key: 'gap', label: 'Gap', icon: Search },
  { key: 'author', label: 'Author', icon: FileCode },
  { key: 'test', label: 'Test', icon: CheckCircle2 },
  { key: 'register', label: 'Register', icon: Sparkles },
  { key: 'distill', label: 'Distill', icon: Brain },
  { key: 'exec', label: 'Execute', icon: Play },
]

function EvolutionProgress() {
  const stage = useOrchestrator((s) => s.evolutionStage)
  const running = useOrchestrator((s) => s.running)
  const phase = useOrchestrator((s) => s.phase)
  if (!running || phase !== 'generation' || !stage) return null

  const currentIdx = STAGES.findIndex((s) => s.key === stage.stage)
  const patching = stage.stage === 'patch'
  const distilling = stage.stage === 'distill'

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="border-b border-white/10 px-4 py-3"
    >
      <div className="flex items-center gap-1.5">
        {STAGES.map((s, i) => {
          const done = currentIdx > i
          const active = currentIdx === i || (patching && s.key === 'test')
          return (
            <div key={s.key} className="flex flex-1 items-center gap-1.5">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-md border text-[10px] transition-all ${
                  done
                    ? 'border-emerald-400/40 bg-emerald-400/15 text-emerald-300'
                    : active
                      ? 'border-orange-400/50 bg-orange-400/15 text-orange-300'
                      : 'border-white/10 bg-white/5 text-white/30'
                }`}
              >
                <s.icon className="h-3 w-3" />
              </div>
              <span
                className={`text-[9px] font-medium uppercase tracking-wider ${
                  done ? 'text-emerald-300/70' : active ? 'text-orange-300' : 'text-white/25'
                }`}
              >
                {s.label}
              </span>
              {i < STAGES.length - 1 && (
                <div className={`h-px flex-1 ${done ? 'bg-emerald-400/30' : 'bg-white/10'}`} />
              )}
            </div>
          )
        })}
      </div>
      {patching && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-amber-300">
          <Wrench className="h-3 w-3 animate-pulse" />
          self-correction: patching compile error…
        </div>
      )}
      {distilling && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-cyan-300">
          <Brain className="h-3 w-3 animate-pulse" />
          distillation: extracting strategic principle…
        </div>
      )}
    </motion.div>
  )
}

export default function PluginRegistry() {
  const plugins = useOrchestrator((s) => s.plugins)
  const taskPlugin = useOrchestrator((s) => s.plugin)
  const freshId = taskPlugin?.id
  const glow = usePhaseGlow(['generation'])

  return (
    <GlassCard premium className={`flex flex-col ${glow}`}>
      <GlassPanelHeader
        icon={<Sparkles className="h-4 w-4" />}
        title="Evolution Engine · Self-Teaching Loop"
        subtitle="custom_plugins/ · gap → author → test → register → distill → execute"
        accent="#fb923c"
        right={
          <span className="rounded-full bg-orange-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-orange-300">
            {plugins.length} tools
          </span>
        }
      />
      <EvolutionProgress />
      <div className="scroll-fancy max-h-96 space-y-2 overflow-y-auto p-4">
        {plugins.length === 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-4 text-xs text-white/40">
            <Code2 className="h-4 w-4 text-white/30" />
            No tools yet. The Evolution Engine will author, sandbox-test and
            register reusable Python tools here as it learns.
          </div>
        )}
        {plugins.map((p) => (
          <PluginCard key={p.id} plugin={p} fresh={p.id === freshId} />
        ))}
      </div>
    </GlassCard>
  )
}
