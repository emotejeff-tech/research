'use client'

import { useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Brain,
  Search,
  FileText,
  ShieldCheck,
  Sparkles,
  Zap,
  Network,
  Layers,
  Cpu,
} from 'lucide-react'
import { useOrchestrator } from '@/lib/orchestrator-store'
import Background from '@/components/orchestrator/Background'
import Header from '@/components/orchestrator/Header'
import Footer from '@/components/orchestrator/Footer'
import ResearchConsole from '@/components/orchestrator/ResearchConsole'
import WorkflowGraph from '@/components/orchestrator/WorkflowGraph'
import StreamingLog from '@/components/orchestrator/StreamingLog'
import CriticLoop from '@/components/orchestrator/CriticLoop'
import PluginRegistry from '@/components/orchestrator/PluginRegistry'
import FinalReport from '@/components/orchestrator/FinalReport'
import HistoryPanel from '@/components/orchestrator/HistoryPanel'
import { GlassCard } from '@/components/orchestrator/GlassCard'
import { usePhaseGlow } from '@/components/orchestrator/usePhaseGlow'

const FEATURES = [
  {
    icon: Network,
    title: 'Multi-Agent Orchestration',
    desc: 'A Coordinator decomposes your goal into a DAG of sub-tasks. Discovery, Synthesis, Evolution and Critic agents execute stateful, multi-turn loops — a LangGraph-style execution graph rendered live.',
    color: '#34d399',
  },
  {
    icon: ShieldCheck,
    title: 'Actor–Critic Verification',
    desc: 'Each synthesis draft is inspected by a dedicated Critic for flaws, fallacies and unsupported claims. If it fails, the state loops back to the Actor with targeted feedback — capped at 3 iterations to stop token looping.',
    color: '#fb7185',
  },
  {
    icon: Sparkles,
    title: 'Self-Teaching Plugin Evolution',
    desc: 'When the agent identifies a reusable capability it lacks, the Evolution agent authors a self-contained Python tool, validates it, and caches it to a custom_plugins/ registry for future runs.',
    color: '#fb923c',
  },
  {
    icon: Zap,
    title: 'Hybrid Routing & Degradation',
    desc: 'Cheap web_search powers Discovery; premium LLM calls are reserved for synthesis and critique. Every call has retry + graceful degradation so a single provider failure never kills a run.',
    color: '#fbbf24',
  },
]

const PIPELINE = [
  { icon: Brain, label: 'Plan', desc: 'Coordinator builds the DAG', color: '#34d399' },
  { icon: Search, label: 'Discover', desc: 'Deep web search per branch', color: '#5eead4' },
  { icon: FileText, label: 'Synthesize', desc: 'Actor drafts from evidence', color: '#fbbf24' },
  { icon: ShieldCheck, label: 'Criticize', desc: 'Verifier loops until it passes', color: '#fb7185' },
  { icon: Sparkles, label: 'Evolve', desc: 'Spawn a reusable plugin', color: '#fb923c' },
]

export default function Home() {
  const init = useOrchestrator((s) => s.init)
  const graphGlow = usePhaseGlow(['planning', 'discovery', 'synthesis', 'critique', 'generation'])

  useEffect(() => {
    init()
  }, [init])

  return (
    <div className="relative flex min-h-screen flex-col">
      <Background />
      <Header />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        {/* HERO */}
        <section className="mx-auto max-w-4xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-[11px] font-medium text-white/60 backdrop-blur"
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            Split-agent architecture · self-critique · self-learning
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05 }}
            className="text-balance text-4xl font-bold leading-[1.05] tracking-tight text-white sm:text-6xl"
          >
            The Autonomous <span className="text-gradient">Research Engine</span>
            <br className="hidden sm:block" /> that critiques its own mind
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.12 }}
            className="mx-auto mt-5 max-w-2xl text-pretty text-sm leading-relaxed text-white/55 sm:text-base"
          >
            Give it a goal. A <strong className="text-emerald-300">Coordinator</strong> plans, a{' '}
            <strong className="text-teal-300">Discovery</strong> agent searches the web, a{' '}
            <strong className="text-amber-300">Synthesis</strong> agent drafts, a{' '}
            <strong className="text-rose-300">Critic</strong> verifies in an actor–critic loop,
            and an <strong className="text-orange-300">Evolution</strong> agent caches new tools
            for next time — all streamed live to a 3D glass interface.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="mt-8 text-left"
          >
            <ResearchConsole />
          </motion.div>
        </section>

        {/* PIPELINE STRIP */}
        <motion.section
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="mt-10"
        >
          <div className="glass flex flex-wrap items-center justify-center gap-2 rounded-2xl p-3 sm:gap-4 sm:p-4">
            {PIPELINE.map((p, i) => {
              const Icon = p.icon
              return (
                <div key={p.label} className="flex items-center gap-2 sm:gap-4">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-xl"
                      style={{ background: `${p.color}1f`, color: p.color }}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="hidden sm:block">
                      <div className="text-xs font-semibold text-white/85">{p.label}</div>
                      <div className="text-[10px] text-white/40">{p.desc}</div>
                    </div>
                    <div className="sm:hidden text-xs font-semibold text-white/85">{p.label}</div>
                  </div>
                  {i < PIPELINE.length - 1 && (
                    <span className="text-white/20">→</span>
                  )}
                </div>
              )
            })}
          </div>
        </motion.section>

        {/* LIVE WORKSPACE */}
        <section className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-[1.55fr_1fr]">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <GlassCard className={`flex h-full flex-col ${graphGlow}`}>
              <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-400/15 text-teal-300">
                  <Layers className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-white/90">Execution Graph</h3>
                  <p className="text-[11px] text-white/45">Live DAG · agents, sources & control flow</p>
                </div>
              </div>
              <div className="p-3">
                <WorkflowGraph />
              </div>
            </GlassCard>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.05 }}
          >
            <StreamingLog />
          </motion.div>
        </section>

        {/* CRITIC + PLUGINS */}
        <section className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <CriticLoop />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.05 }}
          >
            <PluginRegistry />
          </motion.div>
        </section>

        {/* FINAL REPORT */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-5"
        >
          <FinalReport />
        </motion.section>

        {/* ARCHITECTURE / FEATURES */}
        <section className="mt-14">
          <div className="mb-6 text-center">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-widest text-white/50">
              <Cpu className="h-3 w-3" /> The Core Engine
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Built to <span className="text-gradient">self-critique &amp; self-teach</span>
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-white/50">
              A split-agent architecture that avoids the standard bottlenecks of
              single-LLM pipelines: hallucination, token exhaustion, and rigid tooling.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {FEATURES.map((f, i) => {
              const Icon = f.icon
              return (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                >
                  <GlassCard hover className="h-full p-5">
                    <div className="flex items-start gap-4">
                      <span
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                        style={{ background: `${f.color}1f`, color: f.color }}
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      <div>
                        <h3 className="text-sm font-semibold text-white/90">{f.title}</h3>
                        <p className="mt-1.5 text-[13px] leading-relaxed text-white/55">
                          {f.desc}
                        </p>
                      </div>
                    </div>
                  </GlassCard>
                </motion.div>
              )
            })}
          </div>
        </section>

        {/* HISTORY */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-10"
        >
          <HistoryPanel />
        </motion.section>
      </main>

      <Footer />
    </div>
  )
}
