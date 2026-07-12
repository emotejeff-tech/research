'use client'

import { useState, type FormEvent } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { Rocket, Loader2, Sparkles, RotateCcw, Cpu, AlertTriangle, Microscope, Wrench } from 'lucide-react'
import { useOrchestrator, PHASE_LABELS, type Phase, type TaskType } from '@/lib/orchestrator-store'
import { usePhaseGlow } from './usePhaseGlow'
import { cn } from '@/lib/utils'

const EXAMPLES = [
  'Evaluate whether nuclear fusion will reach net-positive commercial energy this decade',
  'Compare CRISPR delivery vectors: AAV vs lipid nanoparticles — which is more clinically viable?',
  'Design a blueprint for a decentralized AI inference network using latest research',
  'Is lithium-iron-phosphate objectively safer than NMC for grid storage?',
]

const PHASE_FLOW: { key: Phase; label: string; color: string }[] = [
  { key: 'planning', label: 'Plan', color: '#34d399' },
  { key: 'discovery', label: 'Discover', color: '#5eead4' },
  { key: 'synthesis', label: 'Synthesize', color: '#a78bfa' },
  { key: 'critique', label: 'Critic', color: '#f59e0b' },
  { key: 'reflection', label: 'Dream', color: '#a78bfa' },
  { key: 'generation', label: 'Evolve', color: '#ec4899' },
  { key: 'final', label: 'Deliver', color: '#34d399' },
]

function TiltCard({ children, className }: { children: React.ReactNode; className?: string }) {
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const rx = useSpring(useTransform(y, [-0.5, 0.5], [6, -6]), { stiffness: 150, damping: 15 })
  const ry = useSpring(useTransform(x, [-0.5, 0.5], [-6, 6]), { stiffness: 150, damping: 15 })

  return (
    <motion.div
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        x.set((e.clientX - r.left) / r.width - 0.5)
        y.set((e.clientY - r.top) / r.height - 0.5)
      }}
      onMouseLeave={() => {
        x.set(0)
        y.set(0)
      }}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 1000 }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export default function ResearchConsole() {
  const [query, setQuery] = useState('')
  const startResearch = useOrchestrator((s) => s.startResearch)
  const reset = useOrchestrator((s) => s.reset)
  const running = useOrchestrator((s) => s.running)
  const phase = useOrchestrator((s) => s.phase)
  const phaseTitle = useOrchestrator((s) => s.phaseTitle)
  const routingMode = useOrchestrator((s) => s.routingMode)
  const routingTier = useOrchestrator((s) => s.routingTier)
  const taskType = useOrchestrator((s) => s.taskType)
  const planningGlow = usePhaseGlow(['planning'])

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!query.trim() || running) return
    startResearch(query)
  }

  const phaseIndex = PHASE_FLOW.findIndex((p) => p.key === phase)
  const degraded = routingMode === 'degraded'

  return (
    <TiltCard className="glass-strong relative overflow-hidden rounded-3xl p-1.5">
      {/* glow border */}
      <div className="pointer-events-none absolute inset-0 rounded-3xl bg-gradient-to-br from-emerald-400/10 via-amber-400/5 to-rose-400/10" />
      <div className={cn('relative rounded-[20px] bg-black/30 p-5 sm:p-7', planningGlow)}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-400/15 text-emerald-300">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-white/60">
                Research Directive
              </div>
              <div className="text-[11px] text-white/35">
                Autonomous multi-agent execution
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(running || phase === 'final') && (
              <span
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider',
                  taskType === 'blueprint'
                    ? 'bg-orange-400/10 text-orange-300'
                    : 'bg-teal-400/10 text-teal-300',
                )}
                title={
                  taskType === 'blueprint'
                    ? 'Blueprint mode — agents produce the best actionable design using latest research'
                    : 'Research mode — agents form an independent, evidence-based conclusion (primary data only, no narrative adoption, definitive verdict)'
                }
              >
                {taskType === 'blueprint' ? (
                  <Wrench className="h-3 w-3" />
                ) : (
                  <Microscope className="h-3 w-3" />
                )}
                {taskType === 'blueprint' ? 'blueprint' : 'research'}
              </span>
            )}
            {degraded && (
              <span
                className="flex items-center gap-1.5 rounded-full bg-amber-400/10 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300"
                title="Primary LLM unavailable — running on no-LLM fallback"
              >
                <AlertTriangle className="h-3 w-3" />
                degraded
              </span>
            )}
            <span
              className={cn(
                'flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[10px] font-medium',
                routingTier === 'degraded'
                  ? 'bg-amber-400/10 text-amber-300'
                  : routingTier === 'local'
                    ? 'bg-sky-400/10 text-sky-300'
                    : 'bg-emerald-400/10 text-emerald-300',
              )}
              title={
                routingTier === 'degraded'
                  ? 'All inference tiers exhausted — no-LLM fallback active'
                  : routingTier === 'local'
                    ? 'Primary cloud gateway unavailable — served by local model tier (Ollama / LM Studio)'
                    : 'Primary cloud LLM pipeline active'
              }
            >
              <Cpu className="h-3 w-3" />
              {routingTier === 'degraded' ? 'degraded' : routingTier === 'local' ? 'local model' : 'primary'}
            </span>
            {running && (
              <span className="flex items-center gap-2 rounded-full bg-amber-400/10 px-3 py-1.5 text-[11px] font-medium text-amber-300">
                <Loader2 className="h-3 w-3 animate-spin" />
                {PHASE_LABELS[phase]} active
              </span>
            )}
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={running}
            rows={3}
            placeholder="Describe a research goal — the Coordinator will decompose it, the Discovery agent will search the web, the Synthesis agent will draft a report, and the Critic will verify it…"
            className="scroll-fancy w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/90 placeholder:text-white/30 outline-none transition-colors focus:border-emerald-400/40 focus:bg-white/[0.06] disabled:opacity-60"
          />
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="submit"
              disabled={running || !query.trim()}
              className={cn(
                'group relative inline-flex items-center gap-2 overflow-hidden rounded-xl px-5 py-2.5 text-sm font-semibold transition-all',
                running || !query.trim()
                  ? 'cursor-not-allowed bg-white/5 text-white/30'
                  : 'bg-gradient-to-r from-emerald-400 to-amber-400 text-black hover:shadow-[0_0_30px_-4px_rgba(52,211,153,0.6)]',
              )}
            >
              {running ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Rocket className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              )}
              {running ? 'Running…' : 'Launch Research'}
            </button>
            {(phase !== 'idle' || running) && (
              <button
                type="button"
                onClick={reset}
                disabled={running}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/60 transition-colors hover:bg-white/10 hover:text-white/80 disabled:opacity-40"
              >
                <RotateCcw className="h-4 w-4" />
                Reset
              </button>
            )}
            <div className="ml-auto hidden text-[11px] text-white/30 sm:block">
              ⏎ to launch
            </div>
          </div>
        </form>

        {/* Examples */}
        {!running && (
          <div className="mt-4 flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => setQuery(ex)}
                className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] text-white/55 transition-colors hover:border-emerald-400/30 hover:bg-emerald-400/[0.06] hover:text-emerald-200"
              >
                {ex}
              </button>
            ))}
          </div>
        )}

        {/* Phase pipeline */}
        {(running || phase === 'final') && (
          <div className="mt-5 border-t border-white/10 pt-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-white/40">
                Execution pipeline
              </span>
              <span className="text-[11px] text-white/50">{phaseTitle}</span>
            </div>
            <div className="flex items-center gap-1.5">
              {PHASE_FLOW.map((p, i) => {
                const done = phaseIndex > i || phase === 'final'
                const active = phaseIndex === i && phase !== 'final'
                return (
                  <div key={p.key} className="flex flex-1 items-center gap-1.5">
                    <div
                      className={cn(
                        'relative h-1.5 flex-1 rounded-full transition-all',
                        done ? 'bg-emerald-400/70' : active ? 'bg-amber-400/70' : 'bg-white/10',
                      )}
                    >
                      {active && (
                        <span className="absolute inset-0 animate-pulse rounded-full bg-amber-400/40" />
                      )}
                    </div>
                    <span
                      className={cn(
                        'w-14 shrink-0 text-[9px] font-medium uppercase tracking-wider transition-colors',
                        done
                          ? 'text-emerald-300'
                          : active
                            ? 'text-amber-300'
                            : 'text-white/25',
                      )}
                    >
                      {p.label}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </TiltCard>
  )
}
