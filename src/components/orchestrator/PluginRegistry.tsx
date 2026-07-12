'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Sparkles, Code2, ChevronDown, Terminal, Clock } from 'lucide-react'
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

function PluginCard({ plugin, fresh }: { plugin: Plugin; fresh?: boolean }) {
  const [open, setOpen] = useState(false)
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
            <div className="flex items-center gap-2">
              <span className="truncate font-mono text-xs font-semibold text-white/90">
                {plugin.name}
              </span>
              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-white/50">
                {plugin.language}
              </span>
              {fresh && (
                <span className="rounded bg-orange-400/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-orange-300">
                  new
                </span>
              )}
            </div>
            <p className="truncate text-[11px] text-white/50">{plugin.description}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="hidden items-center gap-1 text-[10px] text-white/30 sm:flex">
            <Clock className="h-3 w-3" />
            {timeAgo(plugin.createdAt)}
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
            <div className="border-t border-white/10 bg-black/40">
              <pre className="scroll-fancy max-h-64 overflow-auto p-4 text-[11px] leading-relaxed">
                <code className="font-mono text-emerald-200/90">{plugin.code}</code>
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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
        title="Plugin Evolution Registry"
        subtitle="custom_plugins/ · self-teaching tool cache"
        accent="#fb923c"
        right={
          <span className="rounded-full bg-orange-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-orange-300">
            {plugins.length} tools
          </span>
        }
      />
      <div className="scroll-fancy max-h-96 space-y-2 overflow-y-auto p-4">
        {plugins.length === 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-4 text-xs text-white/40">
            <Code2 className="h-4 w-4 text-white/30" />
            No plugins yet. The Evolution agent will author and cache reusable
            tools here as it learns.
          </div>
        )}
        {plugins.map((p) => (
          <PluginCard key={p.id} plugin={p} fresh={p.id === freshId} />
        ))}
      </div>
    </GlassCard>
  )
}
