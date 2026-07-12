'use client'

import { AnimatePresence, motion } from 'framer-motion'
import {
  Sparkles,
  Target,
  Lightbulb,
  BookOpen,
  Brain,
  Telescope,
} from 'lucide-react'
import { useOrchestrator } from '@/lib/orchestrator-store'
import { GlassCard, GlassPanelHeader } from './GlassCard'
import { usePhaseGlow } from './usePhaseGlow'

export default function DreamPanel() {
  const dream = useOrchestrator((s) => s.dream)
  const phase = useOrchestrator((s) => s.phase)
  const running = useOrchestrator((s) => s.running)
  const glow = usePhaseGlow(['reflection'])

  const show = dream || (running && phase === 'reflection')

  return (
    <GlassCard premium className={`flex flex-col ${glow}`}>
      <GlassPanelHeader
        icon={<Telescope className="h-4 w-4" />}
        title="Dreamer · Reflection & Possibilities"
        subtitle="Digging deep · dreaming on best outcomes · surfacing papers"
        accent="#a78bfa"
        right={
          dream ? (
            <span className="rounded-full bg-violet-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-violet-300">
              dreamed
            </span>
          ) : running && phase === 'reflection' ? (
            <span className="flex items-center gap-1.5 rounded-full bg-violet-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-violet-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-400" />
              dreaming
            </span>
          ) : null
        }
      />
      <div className="p-5">
        <AnimatePresence mode="wait">
          {!show && (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center gap-3 py-10 text-center"
            >
              <Telescope className="h-9 w-9 text-white/15" />
              <p className="max-w-[300px] text-sm text-white/40">
                After the Critic converges, the Dreamer reflects on all the
                data and dreams on the possibilities — surfacing best outcomes,
                new goals, and relevant papers.
              </p>
            </motion.div>
          )}

          {show && !dream && (
            <motion.div
              key="dreaming"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-2.5 py-6"
            >
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-3 animate-pulse rounded bg-white/5" style={{ width: `${85 - i * 15}%` }} />
              ))}
              <p className="pt-2 text-xs shimmer font-medium">dreaming on possibilities…</p>
            </motion.div>
          )}

          {dream && (
            <motion.div
              key="dream"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              {/* Best Outcome */}
              {dream.bestOutcome && (
                <div className="rounded-xl border border-violet-400/25 bg-violet-400/[0.06] p-3.5">
                  <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-violet-300">
                    <Target className="h-3.5 w-3.5" /> Best Possible Outcome
                  </div>
                  <p className="text-[13px] leading-relaxed text-violet-100/85">{dream.bestOutcome}</p>
                </div>
              )}

              {/* New Goals + Possibilities grid */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {dream.newGoals.length > 0 && (
                  <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.04] p-3.5">
                    <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-emerald-300">
                      <Target className="h-3.5 w-3.5" /> New Goals
                    </div>
                    <ul className="space-y-1">
                      {dream.newGoals.map((g, i) => (
                        <li key={i} className="flex gap-1.5 text-[12px] leading-snug text-white/70">
                          <span className="text-emerald-400/60">›</span> {g}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {dream.possibilities.length > 0 && (
                  <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-3.5">
                    <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-amber-300">
                      <Lightbulb className="h-3.5 w-3.5" /> Possibilities
                    </div>
                    <ul className="space-y-1">
                      {dream.possibilities.map((p, i) => (
                        <li key={i} className="flex gap-1.5 text-[12px] leading-snug text-white/70">
                          <span className="text-amber-400/60">✦</span> {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Papers */}
              {dream.papers.length > 0 && (
                <div className="rounded-xl border border-sky-400/20 bg-sky-400/[0.04] p-3.5">
                  <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-sky-300">
                    <BookOpen className="h-3.5 w-3.5" /> Relevant Papers ({dream.papers.length})
                  </div>
                  <ul className="space-y-1.5">
                    {dream.papers.map((p, i) => (
                      <li key={i} className="text-[12px] leading-snug">
                        <span className="font-medium text-sky-200/90">{p.title}</span>
                        <span className="text-white/45"> — {p.relevance}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Reflection */}
              {dream.reflection && (
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
                  <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-white/50">
                    <Brain className="h-3.5 w-3.5" /> Reflection
                  </div>
                  <p className="text-[13px] italic leading-relaxed text-white/60">{dream.reflection}</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </GlassCard>
  )
}
