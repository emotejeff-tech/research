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

/** Circular glassmorphic ring gauge. */
function RingGauge({ value, max, color, label, sublabel, icon }: {
  value: number
  max: number
  color: string
  label: string
  sublabel: string
  icon: React.ReactNode
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  const radius = 28
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (pct / 100) * circumference
  const isHigh = pct > 80 // flash if over 80%

  return (
    <div className="flex flex-col items-center rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="relative flex h-20 w-20 items-center justify-center">
        <svg className="h-20 w-20 -rotate-90" viewBox="0 0 70 70">
          <circle cx="35" cy="35" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
          <motion.circle
            cx="35" cy="35" r={radius} fill="none"
            stroke={color}
            strokeWidth="5" strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            style={isHigh ? { filter: `drop-shadow(0 0 6px ${color})` } : undefined}
          />
        </svg>
        <div className="absolute flex flex-col items-center">
          <span className={`text-sm font-bold ${isHigh ? 'animate-pulse' : ''}`} style={{ color }}>
            {label}
          </span>
        </div>
      </div>
      <div className="mt-1.5 flex items-center gap-1 text-[10px] uppercase tracking-wider text-white/40">
        {icon}
        {sublabel}
      </div>
    </div>
  )
}

export default function HardwareTelemetry() {
  const stats = useOrchestrator((s) => s.systemStats)
  const requestStats = useOrchestrator((s) => s.requestStats)
  const running = useOrchestrator((s) => s.running)

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
        subtitle="Orchestrator resources · circular gauges"
        accent="#5eead4"
        right={
          <span className="flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-wider text-white/50">
            <span className={`h-1.5 w-1.5 rounded-full ${running ? 'animate-pulse bg-emerald-400' : 'bg-white/30'}`} />
            {stats ? 'live' : 'connecting…'}
          </span>
        }
      />
      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
        {/* Heap Memory — circular gauge */}
        <RingGauge
          value={stats?.mem.heapUsed || 0}
          max={stats?.mem.heapTotal || 1}
          color={heapPct > 80 ? '#ef4444' : '#34d399'}
          label={stats ? formatBytes(stats.mem.heapUsed) : '—'}
          sublabel="Heap"
          icon={<HardDrive className="h-3 w-3" />}
        />
        {/* RSS — circular gauge (relative to 512MB) */}
        <RingGauge
          value={stats?.mem.rss || 0}
          max={512 * 1024 * 1024}
          color={stats && stats.mem.rss > 400 * 1024 * 1024 ? '#f59e0b' : '#5eead4'}
          label={stats ? formatBytes(stats.mem.rss) : '—'}
          sublabel="RSS"
          icon={<Database className="h-3 w-3" />}
        />
        {/* Vector Memory — count gauge (relative to 200) */}
        <RingGauge
          value={stats?.memory.count || 0}
          max={200}
          color="#a78bfa"
          label={String(stats?.memory.count || 0)}
          sublabel="Vectors"
          icon={<Brain className="h-3 w-3" />}
        />
        {/* Cache Hits — gauge (relative to 100) */}
        <RingGauge
          value={stats?.cache.totalHits || 0}
          max={100}
          color="#fbbf24"
          label={String(stats?.cache.totalHits || 0)}
          sublabel="Cache Hits"
          icon={<Zap className="h-3 w-3" />}
        />
      </div>
      {/* Uptime + cache entries */}
      <div className="flex items-center justify-between border-t border-white/10 px-4 py-2 text-[10px] text-white/40">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" /> Uptime: {stats ? formatUptime(stats.uptime) : '—'}
        </span>
        <span>Cache entries: {stats?.cache.entries || 0}</span>
        <span>Plugins: {stats?.plugins || 0}</span>
      </div>
    </GlassCard>
  )
}
