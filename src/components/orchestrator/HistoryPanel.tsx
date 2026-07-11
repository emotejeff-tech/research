'use client'

import { motion } from 'framer-motion'
import { History, Clock, ShieldCheck, Database, RotateCw } from 'lucide-react'
import { useOrchestrator } from '@/lib/orchestrator-store'
import { GlassCard, GlassPanelHeader } from './GlassCard'

export default function HistoryPanel() {
  const history = useOrchestrator((s) => s.history)
  const startResearch = useOrchestrator((s) => s.startResearch)
  const running = useOrchestrator((s) => s.running)

  return (
    <GlassCard>
      <GlassPanelHeader
        icon={<History className="h-4 w-4" />}
        title="Research Archive"
        subtitle="Previously completed autonomous runs"
        accent="#5eead4"
        right={
          <span className="rounded-full bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-wider text-white/50">
            {history.length} runs
          </span>
        }
      />
      <div className="scroll-fancy max-h-72 space-y-2 overflow-y-auto p-4">
        {history.length === 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-4 text-xs text-white/40">
            <History className="h-4 w-4 text-white/30" />
            No completed runs yet. Each finished research goal is archived here.
          </div>
        )}
        {history.map((h) => (
          <motion.div
            key={h.id}
            layout
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-white/85">{h.query}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-white/40">
                <span className="flex items-center gap-1">
                  <Database className="h-3 w-3" />
                  {h.sources} sources
                </span>
                <span className="flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3" />
                  {h.iterations} iter
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {h.finishedAt
                    ? `${((h.finishedAt - h.startedAt) / 1000).toFixed(1)}s`
                    : '—'}
                </span>
              </div>
            </div>
            <button
              onClick={() => !running && startResearch(h.query)}
              disabled={running}
              className="flex shrink-0 items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] text-white/55 opacity-0 transition-all hover:bg-white/10 hover:text-white/80 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <RotateCw className="h-3 w-3" />
              rerun
            </button>
          </motion.div>
        ))}
      </div>
    </GlassCard>
  )
}
