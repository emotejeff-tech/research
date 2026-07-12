'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts'
import {
  TrendingUp,
  TrendingDown,
  Zap,
  ShieldCheck,
  Database,
  Activity,
  Minus,
  Trash2,
} from 'lucide-react'
import { useOrchestrator, type RunLog } from '@/lib/orchestrator-store'
import { GlassCard, GlassPanelHeader } from './GlassCard'
import { usePhaseGlow } from './usePhaseGlow'

/** Fact density: unique sources per 100 words (higher = denser evidence). */
function factDensity(log: RunLog): number {
  if (!log.wordCount) return 0
  return (log.sourceCount / log.wordCount) * 100
}

/** Average an array of numbers. */
function avg(xs: number[]): number {
  if (!xs.length) return 0
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

interface TrendStat {
  icon: typeof Zap
  label: string
  recent: number
  deltaPct: number // positive = improving
  fmt: (n: number) => string
  color: string
  goodDirection: 'up' | 'down'
  hint: string
}

function TrendCard({ stat }: { stat: TrendStat }) {
  const improving =
    stat.deltaPct === 0 ? null : stat.goodDirection === 'down' ? stat.deltaPct > 0 : stat.deltaPct > 0
  const TrendIcon = improving === null ? Minus : improving ? TrendingDown : TrendingUp
  // For "down is good" metrics, a downward arrow = improving (green).
  // For "up is good" metrics, an upward arrow = improving (green).
  const arrowColor =
    improving === null
      ? '#94a3b8'
      : improving
        ? '#34d399'
        : '#fb7185'

  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={{ background: `${stat.color}1f`, color: stat.color }}
      >
        <stat.icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wider text-white/40">{stat.label}</div>
        <div className="flex items-baseline gap-2">
          <span className="text-base font-semibold text-white/90">{stat.fmt(stat.recent)}</span>
          <span
            className="flex items-center gap-0.5 text-[10px] font-semibold"
            style={{ color: arrowColor }}
          >
            <TrendIcon className="h-3 w-3" />
            {stat.deltaPct === 0 ? '—' : `${Math.abs(stat.deltaPct).toFixed(0)}%`}
          </span>
        </div>
      </div>
      <span className="hidden shrink-0 text-[9px] uppercase tracking-wide text-white/30 sm:block">
        {stat.hint}
      </span>
    </div>
  )
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const p = payload[0]?.payload as any
  return (
    <div className="rounded-xl border border-white/15 bg-black/85 p-3 text-[11px] shadow-xl backdrop-blur">
      <div className="mb-1 font-semibold text-white/90">{label}</div>
      <div className="space-y-0.5 text-white/70">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-400" /> Duration: {p.duration}s
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-amber-400" /> Critique loops: {p.loops}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-rose-400" /> Fact density: {p.density.toFixed(2)}
        </div>
      </div>
      {p.query && (
        <div className="mt-1.5 max-w-[200px] truncate border-t border-white/10 pt-1.5 text-[10px] italic text-white/45">
          {p.query}
        </div>
      )}
    </div>
  )
}

export default function ImprovementGraph() {
  const logs = useOrchestrator((s) => s.telemetryLogs)
  const clearTelemetry = useOrchestrator((s) => s.clearTelemetry)
  const glow = usePhaseGlow(['final'])

  const chartData = useMemo(
    () =>
      logs.map((log, i) => ({
        runNumber: `#${i + 1}`,
        duration: +(log.durationMs / 1000).toFixed(1),
        loops: log.iterations,
        density: +factDensity(log).toFixed(2),
        query: log.query,
      })),
    [logs],
  )

  // Trend stats: compare recent (last 3) avg vs earlier avg.
  const stats: TrendStat[] = useMemo(() => {
    const recent = logs.slice(-3)
    const earlier = logs.slice(0, Math.max(0, logs.length - 3))
    const recentDur = avg(recent.map((l) => l.durationMs / 1000))
    const earlierDur = avg(earlier.map((l) => l.durationMs / 1000))
    const recentIter = avg(recent.map((l) => l.iterations))
    const earlierIter = avg(earlier.map((l) => l.iterations))
    const recentDens = avg(recent.map(factDensity))
    const earlierDens = avg(earlier.map(factDensity))

    const pct = (r: number, e: number) =>
      e === 0 ? (r === 0 ? 0 : 100) : ((e - r) / e) * 100 // positive = decreased (good for down-metrics)

    return [
      {
        icon: Zap,
        label: 'Execution Efficiency',
        recent: recentDur,
        deltaPct: pct(recentDur, earlierDur),
        fmt: (n) => `${n.toFixed(1)}s`,
        color: '#34d399',
        goodDirection: 'down' as const,
        hint: '↓ = faster',
      },
      {
        icon: ShieldCheck,
        label: 'Convergence Speed',
        recent: recentIter,
        deltaPct: pct(recentIter, earlierIter),
        fmt: (n) => `${n.toFixed(1)} loops`,
        color: '#fbbf24',
        goodDirection: 'down' as const,
        hint: '↓ = better 1st draft',
      },
      {
        icon: Database,
        label: 'Fact Density',
        recent: recentDens,
        deltaPct: earlierDens === 0 ? (recentDens > 0 ? 100 : 0) : ((recentDens - earlierDens) / earlierDens) * 100,
        fmt: (n) => `${n.toFixed(2)}`,
        color: '#fb7185',
        goodDirection: 'up' as const,
        hint: '↑ = denser',
      },
    ]
  }, [logs])

  const hasData = logs.length > 0

  return (
    <GlassCard premium className={`flex flex-col ${glow}`}>
      <GlassPanelHeader
        icon={<Activity className="h-4 w-4" />}
        title="Autonomous Performance Optimization"
        subtitle="Improvement across runs · convergence · density · speed"
        accent="#34d399"
        right={
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-wider text-white/50">
              {logs.length} runs
            </span>
            {hasData && (
              <button
                onClick={clearTelemetry}
                className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-white/45 transition-colors hover:border-rose-400/30 hover:bg-rose-400/10 hover:text-rose-300"
                title="Clear all telemetry"
              >
                <Trash2 className="h-3 w-3" />
                clear
              </button>
            )}
          </div>
        }
      />
      <div className="p-5">
        {/* Trend stat cards */}
        <div className="mb-5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {stats.map((s) => (
            <TrendCard key={s.label} stat={s} />
          ))}
        </div>

        {/* Chart */}
        {hasData ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="h-64 w-full"
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="runNumber"
                  stroke="rgba(255,255,255,0.4)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                />
                <YAxis
                  yAxisId="left"
                  stroke="#34d399"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  label={{
                    value: 'seconds',
                    angle: -90,
                    position: 'insideLeft',
                    fill: 'rgba(255,255,255,0.35)',
                    fontSize: 10,
                  }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="#fbbf24"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  label={{
                    value: 'loops',
                    angle: 90,
                    position: 'insideRight',
                    fill: 'rgba(255,255,255,0.35)',
                    fontSize: 10,
                  }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                  iconType="circle"
                  formatter={(value) => <span className="text-white/60">{value}</span>}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="duration"
                  stroke="#34d399"
                  strokeWidth={2}
                  dot={{ fill: '#34d399', r: 3 }}
                  activeDot={{ r: 5 }}
                  name="Speed (s)"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="loops"
                  stroke="#fbbf24"
                  strokeWidth={2}
                  dot={{ fill: '#fbbf24', r: 3 }}
                  activeDot={{ r: 5 }}
                  name="Critique loops"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="density"
                  stroke="#fb7185"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  dot={{ fill: '#fb7185', r: 3 }}
                  activeDot={{ r: 5 }}
                  name="Fact density"
                />
              </LineChart>
            </ResponsiveContainer>
          </motion.div>
        ) : (
          <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
            <Activity className="h-9 w-9 text-white/15" />
            <p className="max-w-[300px] text-sm text-white/40">
              No telemetry yet. Each completed run records convergence speed, fact
              density and execution time — plotted here so you can watch the
              agents self-optimize over time.
            </p>
          </div>
        )}
        <p className="mt-3 text-center text-[11px] text-white/30">
          Downward trajectories on <span className="text-emerald-300/70">speed</span> and{' '}
          <span className="text-amber-300/70">critique loops</span>, plus upward{' '}
          <span className="text-rose-300/70">fact density</span>, denote iterative
          self-learning &amp; plugin-caching improvements.
        </p>
      </div>
    </GlassCard>
  )
}
