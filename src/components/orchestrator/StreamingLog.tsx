'use client'

import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Brain,
  Search,
  FileText,
  ShieldCheck,
  Sparkles,
  Flag,
  AlertTriangle,
  Link2,
  Radio,
} from 'lucide-react'
import { useOrchestrator, type LogEntry } from '@/lib/orchestrator-store'
import { GlassCard, GlassPanelHeader } from './GlassCard'
import { usePhaseGlow } from './usePhaseGlow'

const ICONS: Record<LogEntry['kind'], typeof Brain> = {
  phase: Flag,
  thought: Brain,
  source: Link2,
  critique: ShieldCheck,
  iteration: Radio,
  plugin: Sparkles,
  final: Flag,
  error: AlertTriangle,
}

const AGENT_COLOR: Record<string, string> = {
  Coordinator: '#34d399',
  Discovery: '#5eead4',
  Synthesis: '#fbbf24',
  Critic: '#fb7185',
  Evolution: '#fb923c',
}

function colorFor(entry: LogEntry): string {
  if (entry.kind === 'error') return '#fb7185'
  if (entry.kind === 'final') return '#34d399'
  if (entry.kind === 'source') return '#94a3b8'
  if (entry.kind === 'critique') return '#fb7185'
  if (entry.kind === 'plugin') return '#fb923c'
  if (entry.agent && AGENT_COLOR[entry.agent]) return AGENT_COLOR[entry.agent]
  return '#fbbf24'
}

export default function StreamingLog() {
  const log = useOrchestrator((s) => s.log)
  const running = useOrchestrator((s) => s.running)
  const scrollRef = useRef<HTMLDivElement>(null)
  const glow = usePhaseGlow(['discovery'])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [log.length])

  return (
    <GlassCard className={`flex h-[560px] flex-col ${glow}`}>
      <GlassPanelHeader
        icon={<Radio className="h-4 w-4" />}
        title="Agent Stream"
        subtitle="Live reasoning & events"
        accent="#5eead4"
        right={
          <span className="flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-wider text-white/60">
            <span className={`h-1.5 w-1.5 rounded-full ${running ? 'bg-emerald-400' : 'bg-white/30'} ${running ? 'animate-pulse' : ''}`} />
            {running ? 'streaming' : 'idle'}
          </span>
        }
      />
      <div
        ref={scrollRef}
        className="scroll-fancy flex-1 space-y-2 overflow-y-auto p-4"
      >
        <AnimatePresence initial={false}>
          {log.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex h-full flex-col items-center justify-center gap-3 text-center"
            >
              <Brain className="h-8 w-8 text-white/20" />
              <p className="max-w-[220px] text-xs text-white/40">
                The agent stream is quiet. Launch a research goal to watch
                agents reason in real time.
              </p>
            </motion.div>
          )}
          {log.map((entry) => {
            const Icon = ICONS[entry.kind] || Brain
            const c = colorFor(entry)
            return (
              <motion.div
                key={entry.id}
                layout
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.25 }}
                className="flex gap-2.5 rounded-xl border border-white/5 bg-white/[0.03] p-2.5"
              >
                <span
                  className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: `${c}1f`, color: c }}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  {entry.agent && (
                    <div
                      className="text-[10px] font-semibold uppercase tracking-wider"
                      style={{ color: c }}
                    >
                      {entry.agent}
                    </div>
                  )}
                  <p className="text-[13px] leading-snug text-white/80">{entry.text}</p>
                  {entry.meta?.subqueries && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {entry.meta.subqueries.map((q: string, i: number) => (
                        <span
                          key={i}
                          className="rounded-md bg-teal-400/10 px-1.5 py-0.5 text-[10px] text-teal-200"
                        >
                          {q}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <span className="shrink-0 text-[10px] tabular-nums text-white/30">
                  {new Date(entry.ts).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </span>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </GlassCard>
  )
}
