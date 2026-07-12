'use client'

import { AnimatePresence, motion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import { FileText, ExternalLink, Clock, ShieldCheck, Database, Sparkles, AlertTriangle } from 'lucide-react'
import { useOrchestrator } from '@/lib/orchestrator-store'
import { GlassCard, GlassPanelHeader } from './GlassCard'
import { usePhaseGlow } from './usePhaseGlow'

function Stat({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: `${color}1f`, color }}>
        {icon}
      </span>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
        <div className="text-sm font-semibold text-white/90">{value}</div>
      </div>
    </div>
  )
}

export default function FinalReport() {
  const finalReport = useOrchestrator((s) => s.finalReport)
  const sources = useOrchestrator((s) => s.sources)
  const finalMeta = useOrchestrator((s) => s.finalMeta)
  const routingMode = useOrchestrator((s) => s.routingMode)
  const routingReason = useOrchestrator((s) => s.routingReason)
  const phase = useOrchestrator((s) => s.phase)
  const error = useOrchestrator((s) => s.error)
  const running = useOrchestrator((s) => s.running)
  const glow = usePhaseGlow(['synthesis', 'final'])

  const show = finalReport || error || running
  const degraded = routingMode === 'degraded'

  return (
    <GlassCard className={`flex flex-col ${glow}`}>
      <GlassPanelHeader
        icon={<FileText className="h-4 w-4" />}
        title="Synthesized Research Output"
        subtitle="Final report after Actor–Critic convergence"
        accent="#34d399"
        right={
          finalMeta ? (
            <span
              className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${
                degraded
                  ? 'bg-amber-400/10 text-amber-300'
                  : 'bg-emerald-400/10 text-emerald-300'
              }`}
            >
              {degraded ? 'degraded' : 'delivered'}
            </span>
          ) : running ? (
            <span className="flex items-center gap-1.5 rounded-full bg-amber-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
              synthesizing
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
              className="flex flex-col items-center justify-center gap-3 py-12 text-center"
            >
              <FileText className="h-10 w-10 text-white/15" />
              <p className="max-w-[300px] text-sm text-white/40">
                The synthesis will materialize here once the agents finish their
                discovery and the Critic signs off on the draft.
              </p>
            </motion.div>
          )}

          {error && (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-xl border border-rose-400/30 bg-rose-400/[0.06] p-4 text-sm text-rose-200"
            >
              <strong className="block mb-1">Orchestration error</strong>
              {error}
            </motion.div>
          )}

          {show && !error && (
            <motion.div
              key="report"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-5"
            >
              {/* Stats */}
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <Stat
                  icon={<Database className="h-3.5 w-3.5" />}
                  label="Sources"
                  value={String(finalMeta?.sourceCount ?? sources.length)}
                  color="#5eead4"
                />
                <Stat
                  icon={<ShieldCheck className="h-3.5 w-3.5" />}
                  label="Critique iters"
                  value={String(finalMeta?.iterations ?? 0)}
                  color="#fb7185"
                />
                <Stat
                  icon={<Clock className="h-3.5 w-3.5" />}
                  label="Duration"
                  value={
                    finalMeta
                      ? `${(finalMeta.durationMs / 1000).toFixed(1)}s`
                      : '—'
                  }
                  color="#fbbf24"
                />
                <Stat
                  icon={<Sparkles className="h-3.5 w-3.5" />}
                  label="Plugin"
                  value={finalMeta ? 'spawned' : '—'}
                  color="#fb923c"
                />
              </div>

              {/* Degraded-mode banner */}
              {degraded && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-2.5 rounded-xl border border-amber-400/30 bg-amber-400/[0.06] p-3"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                  <div className="text-[12px] leading-snug text-amber-100/90">
                    <strong className="font-semibold">Degraded mode active.</strong>{' '}
                    The primary language model was unavailable (credits exhausted
                    or rate-limited), so this report was compiled directly from
                    live web sources without LLM synthesis.
                    {routingReason && (
                      <span className="mt-0.5 block text-[11px] text-amber-200/60">
                        Reason: {routingReason}
                      </span>
                    )}
                  </div>
                </motion.div>
              )}

              {/* Report */}
              {finalReport ? (
                <div className="report-prose scroll-fancy max-h-[480px] overflow-y-auto rounded-xl border border-white/10 bg-black/30 p-5">
                  <ReactMarkdown>{finalReport}</ReactMarkdown>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-3 animate-pulse rounded bg-white/5" style={{ width: `${90 - i * 12}%` }} />
                  ))}
                  <p className="pt-2 text-xs shimmer font-medium">agents writing…</p>
                </div>
              )}

              {/* Sources */}
              {sources.length > 0 && (
                <div>
                  <h4 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-white/50">
                    <Database className="h-3.5 w-3.5" /> Evidence ({sources.length})
                  </h4>
                  <div className="scroll-fancy grid max-h-56 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2">
                    {sources.map((s, i) => (
                      <a
                        key={s.id}
                        href={s.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="group flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 transition-colors hover:border-teal-400/30 hover:bg-teal-400/[0.05]"
                      >
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-teal-400/15 text-[10px] font-bold text-teal-300">
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[11px] font-medium text-white/80 group-hover:text-teal-200">
                            {s.title}
                          </div>
                          <div className="truncate text-[10px] text-white/35">{s.host}</div>
                        </div>
                        <ExternalLink className="h-3 w-3 shrink-0 text-white/30 group-hover:text-teal-300" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </GlassCard>
  )
}
