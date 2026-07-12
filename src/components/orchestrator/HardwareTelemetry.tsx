'use client'

import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { Cpu, HardDrive, Database, Zap, Clock, Brain } from 'lucide-react'
import { useOrchestrator } from '@/lib/orchestrator-store'
import { GlassCard, GlassPanelHeader } from './GlassCard'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function StatBar({ label, value, max, color, fmt }: { label: string; value: number; max: number; color: string; fmt: (n: number) => string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[10px]">
        <span className="uppercase tracking-wider text-white/40">{label}</span>
        <span className="font-mono text-white/70">{fmt(value)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>
    </div>
  )
}

export default function HardwareTelemetry() {
  const stats = useOrchestrator((s) => s.systemStats)
  const requestStats = useOrchestrator((s) => s.requestStats)
  const running = useOrchestrator((s) => s.running)

  // Poll stats every 3s while running, every 15s otherwise.
  useEffect(() => {
    requestStats()
    const interval = setInterval(requestStats, running ? 3000 : 15000)
    return () => clearInterval(interval)
  }, [requestStats, running])

  const heapPct = stats ? (stats.mem.heapUsed / stats.mem.heapTotal) * 100 : 0

  return (
    <GlassCard premium className="flex flex-col">
      <GlassPanelHeader
        icon={<Cpu className="h-4 w-4" />}
        title="Live System Telemetry"
        subtitle="Orchestrator resources · memory · cache · vector store"
        accent="#5eead4"
        right={
          <span className="flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-wider text-white/50">
            <span className={`h-1.5 w-1.5 rounded-full ${running ? 'animate-pulse bg-emerald-400' : 'bg-white/30'}`} />
            {stats ? 'live' : 'connecting…'}
          </span>
        }
      />
      <div className="grid grid-cols-2 gap-3 p-4">
        {/* Memory */}
        <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
            <HardDrive className="h-3 w-3" /> Heap Memory
          </div>
          {stats ? (
            <>
              <StatBar label="Used" value={stats.mem.heapUsed} max={stats.mem.heapTotal} color="#34d399" fmt={formatBytes} />
              <div className="flex justify-between text-[9px] text-white/35">
                <span>RSS: {formatBytes(stats.mem.rss)}</span>
                <span>Total: {formatBytes(stats.mem.heapTotal)}</span>
              </div>
            </>
          ) : (
            <div className="h-8 animate-pulse rounded bg-white/5" />
          )}
        </div>

        {/* Uptime */}
        <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
            <Clock className="h-3 w-3" /> Uptime
          </div>
          {stats ? (
            <div className="text-2xl font-bold text-white/90">{formatUptime(stats.uptime)}</div>
          ) : (
            <div className="h-8 animate-pulse rounded bg-white/5" />
          )}
        </div>

        {/* Vector Memory */}
        <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-violet-300">
            <Brain className="h-3 w-3" /> Vector Memory
          </div>
          {stats ? (
            <>
              <div className="text-2xl font-bold text-white/90">{stats.memory.count}</div>
              <div className="text-[9px] text-white/35">past conclusions indexed</div>
            </>
          ) : (
            <div className="h-8 animate-pulse rounded bg-white/5" />
          )}
        </div>

        {/* Search Cache */}
        <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-sky-300">
            <Database className="h-3 w-3" /> Search Cache
          </div>
          {stats ? (
            <>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-white/90">{stats.cache.entries}</span>
                <span className="flex items-center gap-0.5 text-[10px] text-emerald-300">
                  <Zap className="h-2.5 w-2.5" />
                  {stats.cache.totalHits} hits
                </span>
              </div>
              <div className="text-[9px] text-white/35">cached queries</div>
            </>
          ) : (
            <div className="h-8 animate-pulse rounded bg-white/5" />
          )}
        </div>
      </div>
    </GlassCard>
  )
}
