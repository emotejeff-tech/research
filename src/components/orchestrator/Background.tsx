'use client'

import dynamic from 'next/dynamic'
import { motion } from 'framer-motion'

const Scene3D = dynamic(() => import('./Scene3D'), { ssr: false })

export default function Background() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#070a12]">
      {/* base gradient */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(16,24,32,0.9),_rgba(7,10,18,1))]" />

      {/* aurora blobs */}
      <motion.div
        className="aurora-blob"
        style={{ background: '#10b981', width: 520, height: 520, top: '-10%', left: '-8%' }}
        animate={{ x: [0, 60, 0], y: [0, 40, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="aurora-blob"
        style={{ background: '#f59e0b', width: 460, height: 460, top: '20%', right: '-10%' }}
        animate={{ x: [0, -50, 0], y: [0, 60, 0] }}
        transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="aurora-blob"
        style={{ background: '#fb7185', width: 420, height: 420, bottom: '-12%', left: '30%' }}
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
    </div>
  )
}
