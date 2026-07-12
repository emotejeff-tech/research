'use client'

import dynamic from 'next/dynamic'
import { motion, AnimatePresence } from 'framer-motion'
import { useOrchestrator } from '@/lib/orchestrator-store'

const Scene3D = dynamic(() => import('./Scene3D'), { ssr: false })

export default function Background() {
  const routingMode = useOrchestrator((s) => s.routingMode)
  const running = useOrchestrator((s) => s.running)
  const phase = useOrchestrator((s) => s.phase)

  // State morphing: degraded = amber/crimson, optimal = emerald/cyan
  const isDegraded = routingMode === 'degraded'
  const isError = phase === 'error'

  const blobColors = isError
    ? ['#ef4444', '#dc2626', '#991b1b'] // crimson
    : isDegraded
      ? ['#f59e0b', '#fb7185', '#f97316'] // amber/rose
      : ['#10b981', '#f59e0b', '#fb7185'] // default emerald/amber/rose

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#070a12] transition-all duration-1000">
      {/* base gradient — shifts color based on system state */}
      <div
        className="absolute inset-0 transition-all duration-1000"
        style={{
          background: isError
            ? 'radial-gradient(ellipse at top, rgba(40,10,10,0.9), rgba(7,10,18,1))'
            : isDegraded
              ? 'radial-gradient(ellipse at top, rgba(40,30,10,0.9), rgba(7,10,18,1))'
              : 'radial-gradient(ellipse at top, rgba(16,24,32,0.9), rgba(7,10,18,1))',
        }}
      />

      {/* Status pulse overlay — visible only when degraded/error */}
      <AnimatePresence>
        {(isDegraded || isError) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.03, 0.08, 0.03] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute inset-0"
            style={{
              background: isError
                ? 'radial-gradient(ellipse at center, rgba(239,68,68,0.15), transparent 60%)'
                : 'radial-gradient(ellipse at center, rgba(245,158,11,0.12), transparent 60%)',
            }}
          />
        )}
      </AnimatePresence>

      {/* aurora blobs — color morphs with state */}
      <motion.div
        className="aurora-blob"
        style={{ background: blobColors[0], width: 520, height: 520, top: '-10%', left: '-8%' }}
        animate={{ x: [0, 60, 0], y: [0, 40, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="aurora-blob"
        style={{ background: blobColors[1], width: 460, height: 460, top: '20%', right: '-10%' }}
        animate={{ x: [0, -50, 0], y: [0, 60, 0] }}
        transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="aurora-blob"
        style={{ background: blobColors[2], width: 420, height: 420, bottom: '-12%', left: '30%' }}
        animate={{ x: [0, 40, 0], y: [0, -40, 0] }}
        transition={{ duration: 30, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* 3D layer */}
      <div className="absolute inset-0 opacity-70">
        <Scene3D />
      </div>

      {/* grid overlay */}
      <div className="absolute inset-0 bg-grid" />

      {/* vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_40%,_rgba(0,0,0,0.55))]" />

      {/* Status banner — top edge color bar */}
      <div
        className="absolute top-0 left-0 right-0 h-0.5 transition-colors duration-1000"
        style={{
          background: isError
            ? 'linear-gradient(90deg, #ef4444, #dc2626, #ef4444)'
            : isDegraded
              ? 'linear-gradient(90deg, #f59e0b, #fb7185, #f59e0b)'
              : running
                ? 'linear-gradient(90deg, #34d399, #5eead4, #34d399)'
                : 'transparent',
        }}
      />
    </div>
  )
}
