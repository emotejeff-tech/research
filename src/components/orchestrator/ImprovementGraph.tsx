'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
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
  Gauge,
} from 'lucide-react'
import { useOrchestrator, type RunLog } from '@/lib/orchestrator-store'
import { GlassCard, GlassPanelHeader } from './GlassCard'
import { usePhaseGlow } from './usePhaseGlow'

/** Fact density: unique sources per 100 words (higher = denser evidence). */
function factDensity(log: RunLog): number {
  if (!log.wordCount) return 0
  return (log.sourceCount / log.wordCount) * 100
}

/**
 * Compute the improvement percentile for a single run relative to baseline
 * (the first run). Returns a 0-100 score where 50 = baseline performance.
 * >50 = improved, <50 = disimproved.
 *
 * Each vector contributes equally (1/3). For "down is good" metrics
 * (duration, iterations), lower-than-baseline → higher score.
 * For "up is good" metrics (density), higher-than-baseline → higher score.
 */
function improvementPercentile(log: RunLog, baseline: RunLog): number {
  // Duration: lower is better. 50 at baseline, +25 if halved, -25 if doubled.
  const durRatio = baseline.durationMs > 0 ? log.durationMs / baseline.durationMs : 1
  const durScore = 50 + (1 - durRatio) * 25 // halved → 75, doubled → 25

  // Iterations: lower is better. 50 at baseline, capped 0-3.
  const iterRatio = baseline.iterations > 0 ? log.iterations / baseline.iterations : 1
  const iterScore = 50 + (1 - iterRatio) * 25

  // Density: higher is better. 50 at baseline.
  const baseDens = factDensity(baseline)
  const logDens = factDensity(log)
  const densRatio = baseDens > 0 ? logDens / baseDens : 1
  const densScore = 50 + (densRatio - 1) * 25

  const compound = (durScore + iterScore + densScore) / 3
  return Math.max(0, Math.min(100, compound))
}

function TrendCard({
  icon: Icon,
  label,
  value,
  percentile,
  color,
  goodDirection,
  fmt,
}: {
  icon: typeof Zap
  label: string
  value: number
  percentile: number // 0-100, 50=baseline
  color: string
  goodDirection: 'up' | 'down'
  fmt: (n: number) => string
}) {
  const delta = percentile - 50
  const improving = delta > 0.5
  const disimproving = delta < -0.5
  const TrendIcon = improving ? TrendingUp : disimproving ? TrendingDown : Minus
  const arrowColor = improving ? '#34d399' : disimproving ? '#fb7185' : '#94a3b8'

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
      <div className="mb-2 flex items-center gap-2">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ background: `${color}1f`, color }}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-[10px] uppercase tracking-wider text-white/40">{label}</span>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="text-lg font-semibold text-white/90">{fmt(value)}</span>
        <span className="flex items-center gap-1 text-[11px] font-bold" style={{ color: arrowColor }}>
          <TrendIcon className="h-3 w-3" />
          {delta === 0 ? '±0%' : `${delta > 0 ? '+' : ''}${delta.toFixed(0)}%`}
        </span>
      </div>
      {/* Percentile bar */}
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${percentile}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[9px] text-white/30">
        <span>disimproved</span>
        <span>baseline</span>
        <span>improved</span>
      </div>
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
        <div>Improvement score: <span className="font-bold text-emerald-300">{p.score.toFixed(0)}/100</span></div>
        <div className="text-white/50">{p.delta > 0 ? '+' : ''}{p.delta.toFixed(0)}% vs baseline</div>
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

  const { chartData, compoundScore, perVector, verdict } = useMemo(() => {
    if (logs.length === 0) {
      return { chartData: [], compoundScore: null, perVector: null, verdict: null }
    }
    const baseline = logs[0]
    const chartData = logs.map((log, i) => {
      const score = improvementPercentile(log, baseline)
      return {
        runNumber: `#${i + 1}`,
        score: +score.toFixed(1),
        delta: +(score - 50).toFixed(1),
        query: log.query,
      }
    })

    // Compound: average percentile of last 3 runs.
    const recent = logs.slice(-3)
    const compoundScore = avg(recent.map((l) => improvementPercentile(l, baseline)))

    // Per-vector percentiles for the most recent run.
    const last = logs[logs.length - 1]
    // Recompute per-vector properly:
    const durRatio = baseline.durationMs > 0 ? last.durationMs / baseline.durationMs : 1
    const durScore = Math.max(0, Math.min(100, 50 + (1 - durRatio) * 25))
    const iterRatio = baseline.iterations > 0 ? last.iterations / baseline.iterations : 1
    const iterScore = Math.max(0, Math.min(100, 50 + (1 - iterRatio) * 25))
    const baseDens = factDensity(baseline)
    const lastDens = factDensity(last)
    const densRatio = baseDens > 0 ? lastDens / baseDens : 1
    const densScore = Math.max(0, Math.min(100, 50 + (densRatio - 1) * 25))

    const perVector = {
      duration: { value: last.durationMs / 1000, percentile: durScore, fmt: (n: number) => `${n.toFixed(1)}s` },
      iterations: { value: last.iterations, percentile: iterScore, fmt: (n: number) => `${n.toFixed(1)} loops` },
      density: { value: lastDens, percentile: densScore, fmt: (n: number) => n.toFixed(2) },
    }

    const delta = compoundScore - 50
    const verdict = {
      delta,
      direction: delta > 1 ? 'improved' : delta < -1 ? 'disimproved' : 'stable',
    }

    return { chartData, compoundScore, perVector, verdict }
  }, [logs])

  const hasData = logs.length > 0

  return (
    <GlassCard premium className={`flex flex-col ${glow}`}>
      <GlassPanelHeader
        icon={<Gauge className="h-4 w-4" />}
        title="Improvement Percentile Tracker"
        subtitle="How much the engine has improved or disimproved vs baseline"
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
        {hasData && compoundScore !== null && verdict ? (
          <>
            {/* HERO: Compound improvement percentile */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-5 flex items-center gap-5 rounded-2xl border border-white/10 bg-gradient-to-r from-white/[0.04] to-transparent p-5"
            >
              {/* Gauge */}
              <div className="relative flex h-24 w-24 shrink-0 items-center justify-center">
                <svg className="h-24 w-24 -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
                  <motion.circle
                    cx="50" cy="50" r="42" fill="none"
                    stroke={verdict.direction === 'improved' ? '#34d399' : verdict.direction === 'disimproved' ? '#fb7185' : '#fbbf24'}
                    strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 42}
                    initial={{ strokeDashoffset: 2 * Math.PI * 42 }}
                    animate={{ strokeDashoffset: 2 * Math.PI * 42 * (1 - compoundScore / 100) }}
                    transition={{ duration: 1, ease: 'easeOut' }}
                  />
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className="text-2xl font-bold text-white/90">{compoundScore.toFixed(0)}</span>
                  <span className="text-[9px] uppercase tracking-wider text-white/40">/ 100</span>
                </div>
              </div>
              {/* Verdict */}
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <span
                    className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${
                      verdict.direction === 'improved'
                        ? 'bg-emerald-400/15 text-emerald-300'
                        : verdict.direction === 'disimproved'
                          ? 'bg-rose-400/15 text-rose-300'
                          : 'bg-amber-400/15 text-amber-300'
                    }`}
                  >
                    {verdict.direction === 'improved' ? <TrendingUp className="h-3 w-3" /> : verdict.direction === 'disimproved' ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                    {verdict.direction}
                  </span>
                  <span
                    className="text-lg font-bold"
                    style={{ color: verdict.direction === 'improved' ? '#34d399' : verdict.direction === 'disimproved' ? '#fb7185' : '#fbbf24' }}
                  >
                    {verdict.delta > 0 ? '+' : ''}{verdict.delta.toFixed(0)}%
                  </span>
                </div>
                <p className="text-[12px] leading-snug text-white/55">
                  {verdict.direction === 'improved'
                    ? `The engine is performing ${verdict.delta.toFixed(0)}% better than baseline across convergence speed, fact density, and execution time.`
                    : verdict.direction === 'disimproved'
                      ? `The engine is performing ${Math.abs(verdict.delta).toFixed(0)}% worse than baseline — recent runs are slower, less dense, or need more critique loops.`
                      : 'Performance is stable relative to the baseline run.'}
                </p>
                <p className="mt-1 text-[10px] text-white/35">
                  Baseline = Run #1 · score 50 = baseline · 100 = maximally improved · 0 = maximally disimproved
                </p>
              </div>
            </motion.div>

            {/* Per-vector percentile cards */}
            {perVector && (
              <div className="mb-5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                <TrendCard icon={Zap} label="Execution Efficiency" value={perVector.duration.value} percentile={perVector.duration.percentile} color="#34d399" goodDirection="down" fmt={perVector.duration.fmt} />
                <TrendCard icon={ShieldCheck} label="Convergence Speed" value={perVector.iterations.value} percentile={perVector.iterations.percentile} color="#fbbf24" goodDirection="down" fmt={perVector.iterations.fmt} />
                <TrendCard icon={Database} label="Fact Density" value={perVector.density.value} percentile={perVector.density.percentile} color="#fb7185" goodDirection="up" fmt={perVector.density.fmt} />
              </div>
            )}

            {/* Trend line: improvement score over time */}
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis
                    dataKey="runNumber"
                    stroke="rgba(255,255,255,0.4)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                  />
                  <YAxis
                    domain={[0, 100]}
                    stroke="rgba(255,255,255,0.4)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    label={{
                      value: 'improvement score',
                      angle: -90,
                      position: 'insideLeft',
                      fill: 'rgba(255,255,255,0.35)',
                      fontSize: 10,
                    }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine y={50} stroke="rgba(255,255,255,0.25)" strokeDasharray="5 3" label={{ value: 'baseline', fill: 'rgba(255,255,255,0.35)', fontSize: 10, position: 'right' }} />
                  <Area
                    type="monotone"
                    dataKey="score"
                    stroke="#34d399"
                    strokeWidth={2.5}
                    fill="url(#scoreGrad)"
                    dot={{ fill: '#34d399', r: 3 }}
                    activeDot={{ r: 5 }}
                    name="Improvement score"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-3 text-center text-[11px] text-white/30">
              Score above the <span className="text-white/50">baseline line</span> = improved · below = disimproved.
              Each run is measured against Run #1 across all three vectors.
            </p>
          </>
        ) : (
          <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
            <Activity className="h-9 w-9 text-white/15" />
            <p className="max-w-[300px] text-sm text-white/40">
              No telemetry yet. Each completed run records an improvement
              percentile (0-100) relative to the baseline run, so you can see
              at a glance whether the engine is getting better or worse over
              time.
            </p>
          </div>
        )}
      </div>
    </GlassCard>
  )
}

function avg(xs: number[]): number {
  if (!xs.length) return 0
  return xs.reduce((a, b) => a + b, 0) / xs.length
}
