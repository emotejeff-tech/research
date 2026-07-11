'use client'

import { Cpu, Zap, ShieldCheck, Sparkles } from 'lucide-react'

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-white/5 bg-black/30 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <div className="flex items-center gap-2 text-[11px] text-white/40">
            <Cpu className="h-3.5 w-3.5 text-emerald-400/70" />
            <span>
              NEXUS Engine · Coordinator → Discovery → Synthesis → Critic →
              Evolution
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[10px] text-white/35">
            <span className="flex items-center gap-1">
              <Zap className="h-3 w-3 text-amber-400/70" /> Hybrid LLM routing
            </span>
            <span className="flex items-center gap-1">
              <ShieldCheck className="h-3 w-3 text-rose-400/70" /> Actor–Critic
              verification
            </span>
            <span className="flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-orange-400/70" /> Plugin evolution
            </span>
          </div>
        </div>
        <p className="mt-3 text-center text-[10px] text-white/25 sm:text-left">
          Built with Next.js 16 · React Three Fiber · Framer Motion · ReactFlow ·
          z-ai-web-dev-sdk. Preview via the Preview Panel →
        </p>
      </div>
    </footer>
  )
}
