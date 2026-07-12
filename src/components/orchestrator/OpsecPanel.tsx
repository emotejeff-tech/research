'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { ShieldCheck, ShieldAlert, Eraser, Globe, CheckCircle2, XCircle, Search, Terminal } from 'lucide-react'
import { useOrchestrator } from '@/lib/orchestrator-store'
import { GlassCard, GlassPanelHeader } from './GlassCard'
import { usePhaseGlow } from './usePhaseGlow'

export default function OpsecPanel() {
  const audits = useOrchestrator((s) => s.opsecAudits)
  const phase = useOrchestrator((s) => s.phase)
  const running = useOrchestrator((s) => s.running)
  const glow = usePhaseGlow(['critique', 'final'])

  const totalScrubbed = audits
    .filter((a) => a.tool === 'opsec_log_scrubber')
    .reduce((sum, a) => sum + (a.itemsScrubbed || 0), 0)
  const uaRotations = audits.filter((a) => a.tool === 'ua_rotator').length
  const dorkQueries = audits
    .filter((a) => a.tool === 'google_dorker')
    .reduce((sum, a) => sum + (a.itemsScrubbed || 0), 0) // itemsScrubbed field reused for dorkCount
  const hasAudits = audits.length > 0

  return (
    <GlassCard premium className={`flex flex-col ${glow}`}>
      <GlassPanelHeader
        icon={<ShieldCheck className="h-4 w-4" />}
        title="OPSEC · OSINT Intelligence Skills"
        subtitle="Google dorking · log scrubbing · footprint rotation · exposed-data discovery"
        accent="#fb7185"
        right={
          hasAudits ? (
            <span className="rounded-full bg-rose-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-rose-300">
              {audits.length} action{audits.length !== 1 ? 's' : ''}
            </span>
          ) : running && phase === 'final' ? (
            <span className="flex items-center gap-1.5 rounded-full bg-rose-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-rose-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" />
              running
            </span>
          ) : null
        }
      />
      <div className="p-5">
        <AnimatePresence mode="wait">
          {!hasAudits && (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center gap-3 py-8 text-center"
            >
              <ShieldCheck className="h-8 w-8 text-white/15" />
              <p className="max-w-[300px] text-sm text-white/40">
                OPSEC skills find freely-public information that seems private —
                using Google dorks to surface exposed files, credentials, and
                user data. Also scrubs output and rotates footprints.
              </p>
            </motion.div>
          )}

          {hasAudits && (
            <motion.div
              key="audits"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              {/* Summary stats */}
              <div className="grid grid-cols-3 gap-2.5">
                <div className="flex items-center gap-2.5 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] px-3 py-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-400/15 text-amber-300">
                    <Search className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="text-lg font-bold text-white/90">{dorkQueries}</div>
                    <div className="text-[10px] uppercase tracking-wider text-white/40">dork queries</div>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 rounded-xl border border-rose-400/20 bg-rose-400/[0.05] px-3 py-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-400/15 text-rose-300">
                    <Eraser className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="text-lg font-bold text-white/90">{totalScrubbed}</div>
                    <div className="text-[10px] uppercase tracking-wider text-white/40">items scrubbed</div>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 rounded-xl border border-sky-400/20 bg-sky-400/[0.05] px-3 py-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-400/15 text-sky-300">
                    <Globe className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="text-lg font-bold text-white/90">{uaRotations}</div>
                    <div className="text-[10px] uppercase tracking-wider text-white/40">UA rotations</div>
                  </div>
                </div>
              </div>

              {/* Audit log */}
              <div className="space-y-1.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
                  Audit Trail
                </div>
                {audits.map((a) => (
                  <motion.div
                    key={a.id}
                    layout
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`flex items-start gap-2.5 rounded-lg border p-2.5 ${
                      a.success
                        ? a.tool === 'opsec_log_scrubber'
                          ? 'border-rose-400/25 bg-rose-400/[0.05]'
                          : 'border-sky-400/25 bg-sky-400/[0.05]'
                        : 'border-amber-400/25 bg-amber-400/[0.05]'
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded ${
                        a.success ? 'text-rose-300' : 'text-amber-300'
                      }`}
                    >
                      {a.success ? (
                        a.tool === 'opsec_log_scrubber' ? (
                          <ShieldCheck className="h-3.5 w-3.5" />
                        ) : (
                          <Globe className="h-3.5 w-3.5" />
                        )
                      ) : (
                        <ShieldAlert className="h-3.5 w-3.5" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] font-semibold text-white/80">
                          {a.tool}
                        </span>
                        {a.success ? (
                          <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                        ) : (
                          <XCircle className="h-3 w-3 text-rose-400" />
                        )}
                      </div>
                      <p className="text-[11px] text-white/55">
                        {a.tool === 'opsec_log_scrubber'
                          ? `Scrubbed ${a.itemsScrubbed} high-exposure item(s) (credentials, paths, emails, IPs)`
                          : `Rotated footprint → ${a.rotatedUA?.slice(0, 50) || '…'}`}
                      </p>
                      {a.usageCount !== undefined && (
                        <span className="text-[9px] text-white/30">
                          Used {a.usageCount}× total
                        </span>
                      )}
                    </div>
                    <span className="shrink-0 text-[9px] tabular-nums text-white/25">
                      {new Date(a.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </GlassCard>
  )
}
