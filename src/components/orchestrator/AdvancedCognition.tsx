'use client'

import { AnimatePresence, motion } from 'framer-motion'
import {
  FlaskConical,
  Skull,
  Brain,
  Target,
  Search,
  CheckCircle2,
  XCircle,
  GitBranch,
} from 'lucide-react'
import { useOrchestrator } from '@/lib/orchestrator-store'
import { GlassCard, GlassPanelHeader } from './GlassCard'

export default function AdvancedCognition() {
  const hypotheses = useOrchestrator((s) => s.hypotheses)
  const saboteur = useOrchestrator((s) => s.saboteurInjection)
  const metaHistory = useOrchestrator((s) => s.metaPromptHistory)

  const hasContent = hypotheses.length > 0 || saboteur || metaHistory.length > 0

  return (
    <GlassCard premium className="flex flex-col">
      <GlassPanelHeader
        icon={<Brain className="h-4 w-4" />}
        title="Advanced Cognition Layer"
        subtitle="Hypothesis engine · adversarial red-team · meta-prompt evolution"
        accent="#22d3ee"
        right={
          hasContent ? (
            <span className="rounded-full bg-cyan-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-300">
              {hypotheses.length + (saboteur ? 1 : 0) + metaHistory.length} active
            </span>
          ) : null
        }
      />
      <div className="space-y-3 p-5">
        {/* Hypothesis Engine */}
        {hypotheses.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-cyan-400/20 bg-cyan-400/[0.04] p-3"
          >
            <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-cyan-300">
              <FlaskConical className="h-3 w-3" /> Hypothesis Engine · Anti-Confirmation-Bias
            </div>
            <div className="space-y-1.5">
              {hypotheses.map((h, i) => (
                <div key={i} className="rounded-lg bg-black/30 p-2">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded bg-cyan-400/15 text-[9px] font-bold text-cyan-300">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] leading-snug text-white/75">{h.statement}</p>
                      <div className="mt-1 flex items-center gap-1 text-[9px] text-cyan-300/60">
                        <Search className="h-2.5 w-2.5" />
                        disproof: {h.disproofQuery.slice(0, 70)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Saboteur */}
        {saboteur && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-rose-400/25 bg-rose-400/[0.05] p-3"
          >
            <div className="mb-1.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-rose-300">
              <Skull className="h-3 w-3" /> Saboteur · Adversarial Red-Team
            </div>
            <div className="flex items-start gap-2">
              <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
              <div>
                <p className="text-[11px] leading-snug text-white/70">
                  <strong className="text-rose-300">Injected flaw ({saboteur.flawType}):</strong> {saboteur.flaw}
                </p>
                <p className="mt-1 text-[10px] italic text-rose-300/50">
                  The Critic must detect and reject this poisoned source.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Meta-Prompt Evolution */}
        {metaHistory.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.04] p-3"
          >
            <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
              <GitBranch className="h-3 w-3" /> Meta-Prompt Evolution · {metaHistory.length} evolution(s)
            </div>
            <div className="scroll-fancy max-h-32 space-y-1.5 overflow-y-auto">
              {metaHistory.slice(-3).reverse().map((e, i) => (
                <div key={i} className="rounded-lg bg-black/30 p-2">
                  <p className="text-[11px] leading-snug text-white/70">
                    <CheckCircle2 className="mr-1 inline h-2.5 w-2.5 text-emerald-400" />
                    {e.changes}
                  </p>
                  <p className="mt-0.5 text-[9px] text-white/35">
                    {new Date(e.timestamp).toLocaleString()} · {e.reason}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Empty state */}
        {!hasContent && (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
            <Brain className="h-7 w-7 text-white/15" />
            <p className="max-w-[260px] text-xs text-white/40">
              The Hypothesis Engine generates 3 mutually exclusive hypotheses
              before search; the Saboteur injects poisoned data to test the
              Critic; and Meta-Prompts evolve every 5 runs based on telemetry.
            </p>
          </div>
        )}
      </div>
    </GlassCard>
  )
}
