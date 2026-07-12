'use client'

import dynamic from 'next/dynamic'
import { motion, AnimatePresence } from 'framer-motion'
import { useOrchestrator } from '@/lib/orchestrator-store'

const Scene3D = dynamic(() => import('./Scene3D'), { ssr: false })

export default function Background() {
  const routingMode = useOrchestrator((s) => s.routingMode)
  const running = useOrchestrator((s) => s.running)
  const phase = useOrchestrator((s) => s.phase)

  const isDegraded = routingMode === 'degraded'
  const isError = phase === 'error'

  // Deep blue theme matching the reference UI
  const blobColors = isError
    ? ['#ff3366', '#dc2626', '#991b1b']
    : isDegraded
      ? ['#ffaa00', '#ff3366', '#f97316']
      : ['#0000ff', '#383eff', '#00d4ff'] // deep blue to electric blue to cyan

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-black transition-all duration-1000">
      {/* Deep blue radial gradient base */}
      <div
        className="absolute inset-0 transition-all duration-1000"
        style={{
          background: isError
            ? 'radial-gradient(ellipse at 50% 30%, rgba(40,0,10,0.8), #000000)'
            : isDegraded
              ? 'radial-gradient(ellipse at 50% 30%, rgba(40,20,0,0.6), #000000)'
              : 'radial-gradient(ellipse at 50% 30%, rgba(0,0,54,0.8), #000000)',
        }}
      />

      {/* Status pulse overlay */}
      <AnimatePresence>
        {(isDegraded || isError) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.02, 0.06, 0.02] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute inset-0"
            style={{
              background: isError
                ? 'radial-gradient(ellipse at center, rgba(255,51,102,0.12), transparent 60%)'
                : 'radial-gradient(ellipse at center, rgba(255,170,0,0.1), transparent 60%)',
            }}
          />
        )}
      </AnimatePresence>

      {/* Deep blue aurora blobs */}
      <motion.div
        className="aurora-blob"
        style={{ background: blobColors[0], width: 600, height: 600, top: '-15%', left: '-10%' }}
        animate={{ x: [0, 80, 0], y: [0, 50, 0] }}
        transition={{ duration: 25, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="aurora-blob"
        style={{ background: blobColors[1], width: 500, height: 500, top: '30%', right: '-12%' }}
        animate={{ x: [0, -60, 0], y: [0, 70, 0] }}
        transition={{ duration: 28, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="aurora-blob"
        style={{ background: blobColors[2], width: 450, height: 450, bottom: '-15%', left: '35%' }}
        animate={{ x: [0, 50, 0], y: [0, -50, 0] }}
        transition={{ duration: 32, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* 3D layer */}
      <div className="absolute inset-0 opacity-50">
        <Scene3D />
      </div>

      {/* Subtle blue grid overlay */}
      <div className="absolute inset-0 bg-grid opacity-60" />

      {/* Deep vignette for depth */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_30%,_rgba(0,0,0,0.8))]" />

      {/* Top edge color bar — blue when optimal, amber when degraded, red when error */}
      <div
        className="absolute top-0 left-0 right-0 h-0.5 transition-colors duration-1000"
        style={{
          background: isError
            ? 'linear-gradient(90deg, #ff3366, #dc2626, #ff3366)'
            : isDegraded
              ? 'linear-gradient(90deg, #ffaa00, #ff3366, #ffaa00)'
              : running
                ? 'linear-gradient(90deg, #383eff, #00d4ff, #383eff)'
                : 'transparent',
        }}
      />
    </div>
  )
}
