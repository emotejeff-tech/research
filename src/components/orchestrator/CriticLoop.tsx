'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { ShieldCheck, RefreshCw, Check, AlertTriangle, ArrowRight } from 'lucide-react'
import { useOrchestrator } from '@/lib/orchestrator-store'
import { GlassCard, GlassPanelHeader } from './GlassCard'
import { usePhaseGlow } from './usePhaseGlow'

export default function CriticLoop() {
  const rounds = useOrchestrator((s) => s.critiqueRounds)
  const currentIteration = useOrchestrator((s) => s.currentIteration)
  const phase = useOrchestrator((s) => s.phase)
  const running = useOrchestrator((s) => s.running)
  const glow = usePhaseGlow(['critique'])

  const MAX = 3

  return (
    <GlassCard className={`flex flex-col ${glow}`}>
      <GlassPanelHeader
        icon={<ShieldCheck className="h-4 w-4" />}
        title="Actor–Critic Verification Loop"
        subtitle="Synthesis ↔ Critic · max 3 iterations"
        accent="#fb7185"
        right={
          <span className="rounded-full bg-rose-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-rose-300">
            {rounds.length}/{MAX} rounds
          </span>
        }
      />
      <div className="p-5">
        {/* Progress rail */}
        <div className="mb-5 flex items-center gap-2">
          {Array.from({ length: MAX }).map((_, i) => {
            const round = rounds[i]
            const isCurrent =
              running && currentIteration === i + 1 && (phase === 'synthesis' || phase === 'critique')
            const done = !!round
            return (
              <div key={i} className="flex flex-1 items-center gap-2">
                <div
                  className={`relative flex h-9 w-9 items-center justify-center rounded-xl border text-xs font-semibold transition-all ${
                    done
                      ? round.verdict === 'pass'
                        ? 'border-emerald-400/40 bg-emerald-400/15 text-emerald-300'
                        : 'border-rose-400/40 bg-rose-400/15 text-rose-300'
                      : isCurrent
                        ? 'border-amber-400/50 bg-amber-400/15 text-amber-300'
                        : 'border-white/10 bg-white/5 text-white/30'
                  }`}
                >
                  {isCurrent && (
                    <span className="pulse-ring absolute inset-0 rounded-xl text-amber-400" />
                  )}
                  {done ? (
                    round.verdict === 'pass' ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )
                  ) : (
                    i + 1
                  )}
                </div>
                {i < MAX - 1 && (
                  <div className="h-px flex-1 bg-gradient-to-r from-white/15 to-white/5" />
                )}
              </div>
            )
          })}
        </div>

        {/* Rounds detail */}
        <div className="space-y-2.5">
          <AnimatePresence initial={false}>
            {rounds.length === 0 && !running && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-3 text-xs text-white/40"
              >
                <ShieldCheck className="h-4 w-4 text-white/30" />
                The Critic will verify each synthesis draft for flaws, fallacies and
                unsupported claims — looping back to the Actor until it passes.
              </motion.div>
            )}
            {rounds.map((r) => (
              <motion.div
                key={r.iteration}
                layout
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                className={`rounded-xl border p-3 ${
                  r.verdict === 'pass'
                    ? 'border-emerald-400/30 bg-emerald-400/[0.06]'
                    : 'border-rose-400/30 bg-rose-400/[0.06]'
                }`}
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-md ${
                        r.verdict === 'pass'
                          ? 'bg-emerald-400/20 text-emerald-300'
                          : 'bg-rose-400/20 text-rose-300'
                      }`}
                    >
                      {r.verdict === 'pass' ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <AlertTriangle className="h-3 w-3" />
                      )}
                    </span>
                    <span className="text-xs font-semibold text-white/85">
                      Iteration {r.iteration}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                        r.verdict === 'pass'
                          ? 'bg-emerald-400/15 text-emerald-300'
                          : 'bg-rose-400/15 text-rose-300'
                      }`}
                    >
                      {r.verdict}
                    </span>
                  </div>
                  {r.verdict === 'revise' && (
                    <span className="flex items-center gap-1 text-[10px] text-rose-300/70">
                      <ArrowRight className="h-3 w-3" /> back to Actor
                    </span>
                  )}
                </div>
                {r.issues && r.issues.length > 0 && (
                  <ul className="mb-1 space-y-0.5 pl-4">
                    {r.issues.map((iss, i) => (
                      <li
                        key={i}
                        className="list-disc text-[11px] leading-snug text-white/70"
                      >
                        {iss}
                      </li>
                    ))}
                  </ul>
                )}
                {r.notes && (
                  <p className="text-[11px] italic leading-snug text-white/45">
                    {r.notes}
                  </p>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </GlassCard>
  )
}
