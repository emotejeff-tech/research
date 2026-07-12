'use client'

import { motion } from 'framer-motion'
import { Activity, Github, Wifi, WifiOff, Settings as SettingsIcon, Cpu } from 'lucide-react'
import { useOrchestrator } from '@/lib/orchestrator-store'

export default function Header() {
  const connected = useOrchestrator((s) => s.connected)
  const setSettingsOpen = useOrchestrator((s) => s.setSettingsOpen)
  const llmSettings = useOrchestrator((s) => s.llmSettings)

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-black/30 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <motion.div
            initial={{ rotate: -20, scale: 0.8, opacity: 0 }}
            animate={{ rotate: 0, scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 14 }}
            className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-amber-400 text-black shadow-[0_0_24px_-4px_rgba(52,211,153,0.6)]"
          >
            <Activity className="h-5 w-5" strokeWidth={2.5} />
          </motion.div>
          <div>
            <div className="flex items-baseline gap-2">
              <h1 className="text-base font-bold tracking-tight text-white">
                NEXUS
              </h1>
              <span className="hidden text-[10px] font-medium uppercase tracking-[0.2em] text-white/40 sm:inline">
                Autonomous Research Engine
              </span>
            </div>
            <p className="text-[10px] text-white/35">Split-agent · self-critique · self-teaching</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium ${
              connected
                ? 'bg-emerald-400/10 text-emerald-300'
                : 'bg-rose-400/10 text-rose-300'
            }`}
          >
            {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {connected ? 'orchestrator live' : 'reconnecting…'}
          </span>
          {/* Active provider badge */}
          {llmSettings && llmSettings.provider !== 'zai' && llmSettings.enabled && (
            <span
              className="flex items-center gap-1.5 rounded-full bg-sky-400/10 px-2.5 py-1 text-[10px] font-medium text-sky-300"
              title={`${llmSettings.provider}: ${llmSettings.model}`}
            >
              <Cpu className="h-3 w-3" />
              {llmSettings.provider}
            </span>
          )}
          {/* Settings button */}
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-white/60 transition-colors hover:border-emerald-400/30 hover:bg-emerald-400/10 hover:text-emerald-300"
            title="LLM Provider Settings"
          >
            <SettingsIcon className="h-3 w-3" />
            <span className="hidden sm:inline">Settings</span>
          </button>
          <a
            href="https://github.com/langchain-ai/langgraph"
            target="_blank"
            rel="noreferrer noopener"
            className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-white/50 transition-colors hover:bg-white/10 hover:text-white/80 lg:flex"
          >
            <Github className="h-3 w-3" />
            LangGraph-style DAG
          </a>
        </div>
      </div>
    </header>
  )
}
