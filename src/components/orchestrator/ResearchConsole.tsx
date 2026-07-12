'use client'

import { useState, useRef, type FormEvent } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { Rocket, Loader2, Sparkles, RotateCcw, Cpu, AlertTriangle, Microscope, Wrench, Mic, Volume2, Paperclip, Square } from 'lucide-react'
import { useOrchestrator, PHASE_LABELS, type Phase, type TaskType } from '@/lib/orchestrator-store'
import { usePhaseGlow } from './usePhaseGlow'
import { cn } from '@/lib/utils'

const EXAMPLES = [
  'Evaluate whether nuclear fusion will reach net-positive commercial energy this decade',
  'Compare CRISPR delivery vectors: AAV vs lipid nanoparticles — which is more clinically viable?',
  'Design a blueprint for a decentralized AI inference network using latest research',
  'Is lithium-iron-phosphate objectively safer than NMC for grid storage?',
]

const PHASE_FLOW: { key: Phase; label: string; color: string }[] = [
  { key: 'planning', label: 'Plan', color: '#34d399' },
  { key: 'discovery', label: 'Discover', color: '#5eead4' },
  { key: 'synthesis', label: 'Synthesize', color: '#a78bfa' },
  { key: 'critique', label: 'Critic', color: '#f59e0b' },
  { key: 'reflection', label: 'Dream', color: '#a78bfa' },
  { key: 'generation', label: 'Evolve', color: '#ec4899' },
  { key: 'final', label: 'Deliver', color: '#34d399' },
]

function TiltCard({ children, className }: { children: React.ReactNode; className?: string }) {
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const rx = useSpring(useTransform(y, [-0.5, 0.5], [6, -6]), { stiffness: 150, damping: 15 })
  const ry = useSpring(useTransform(x, [-0.5, 0.5], [-6, 6]), { stiffness: 150, damping: 15 })

  return (
    <motion.div
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        x.set((e.clientX - r.left) / r.width - 0.5)
        y.set((e.clientY - r.top) / r.height - 0.5)
      }}
      onMouseLeave={() => {
        x.set(0)
        y.set(0)
      }}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 1000 }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export default function ResearchConsole() {
  const [query, setQuery] = useState('')
  const startResearch = useOrchestrator((s) => s.startResearch)
  const reset = useOrchestrator((s) => s.reset)
  const running = useOrchestrator((s) => s.running)
  const phase = useOrchestrator((s) => s.phase)
  const phaseTitle = useOrchestrator((s) => s.phaseTitle)
  const routingMode = useOrchestrator((s) => s.routingMode)
  const routingTier = useOrchestrator((s) => s.routingTier)
  const taskType = useOrchestrator((s) => s.taskType)
  const llmSettings = useOrchestrator((s) => s.llmSettings)
  const planningGlow = usePhaseGlow(['planning'])

  // Voice + file upload state
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [attachedFiles, setAttachedFiles] = useState<{ name: string; content: string; type: string }[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)

  // Voice-to-text: record audio → send to Whisper → fill the query box
  const toggleRecording = async () => {
    if (recording) {
      // Stop recording
      mediaRecorderRef.current?.stop()
      setRecording(false)
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      const chunks: Blob[] = []
      recorder.ondataavailable = (e) => chunks.push(e.data)
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        setTranscribing(true)
        try {
          const blob = new Blob(chunks, { type: 'audio/webm' })
          const reader = new FileReader()
          reader.onloadend = async () => {
            const base64 = (reader.result as string).split(',')[1]
            // Send to our STT API route
            const res = await fetch('/api/test-stt', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                url: llmSettings?.voiceBoxUrl || '',
                apiKey: llmSettings?.voiceBoxApiKey || '',
                model: llmSettings?.whisperModel || 'whisper-1',
                audio: base64,
              }),
            })
            const data = await res.json()
            if (data.ok && data.text) {
              setQuery((prev) => (prev ? prev + ' ' + data.text : data.text))
            }
            setTranscribing(false)
          }
          reader.readAsDataURL(blob)
        } catch {
          setTranscribing(false)
        }
      }
      recorder.start()
      mediaRecorderRef.current = recorder
      setRecording(true)
    } catch {
      // Mic blocked
    }
  }

  // File upload: read text files as context
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    Array.from(files).forEach((file) => {
      const reader = new FileReader()
      reader.onload = () => {
        const content = reader.result as string
        setAttachedFiles((prev) => [
          ...prev,
          { name: file.name, content: content.slice(0, 5000), type: file.type || 'text' },
        ])
      }
      // Read as text (works for .txt, .md, .json, .csv, .py, .js, etc.)
      if (file.type.startsWith('text/') || file.name.match(/\.(txt|md|json|csv|py|js|ts|jsx|tsx|html|css|xml|yaml|yml|sql|sh)$/i)) {
        reader.readAsText(file)
      } else {
        // For binary files, just store the name
        setAttachedFiles((prev) => [
          ...prev,
          { name: file.name, content: `[Binary file: ${file.name}]`, type: file.type || 'binary' },
        ])
      }
    })
    // Reset input so the same file can be uploaded again
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeFile = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index))
  }

  // Read the final report aloud
  const speakReport = async () => {
    const report = useOrchestrator.getState().finalReport
    if (!report) return
    try {
      const res = await fetch('/api/test-tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: llmSettings?.voiceBoxUrl || '',
          apiKey: llmSettings?.voiceBoxApiKey || '',
          model: llmSettings?.ttsModel || 'tts-1',
          voice: llmSettings?.ttsVoice || 'alloy',
          text: report.slice(0, 500),
        }),
      })
      const data = await res.json()
      if (data.ok && data.audio) {
        const audio = new Audio(`data:audio/mp3;base64,${data.audio}`)
        audio.play()
      }
    } catch {
      /* best-effort */
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!query.trim() || running) return
    startResearch(query)
  }

  const phaseIndex = PHASE_FLOW.findIndex((p) => p.key === phase)
  const degraded = routingMode === 'degraded'

  return (
    <div className="relative">
      {/* OUTER GLOW FALLOFF — bright neon blue halo extending outward (matches image: ~10px falloff) */}
      <div
        className="pointer-events-none absolute -inset-[2px] rounded-[20px]"
        style={{
          background: '#71bcfd',
          filter: 'blur(4px)',
          opacity: 0.5,
        }}
      />
      <div
        className="pointer-events-none absolute -inset-[6px] rounded-[22px]"
        style={{
          background: 'linear-gradient(135deg, rgba(113,188,253,0.6), rgba(56,62,255,0.3), rgba(113,188,253,0.6))',
          filter: 'blur(12px)',
          opacity: 0.4,
        }}
      />
      <motion.div
        className="pointer-events-none absolute -inset-[14px] rounded-[28px]"
        style={{
          background: 'radial-gradient(ellipse at top, rgba(113,188,253,0.25), transparent 70%)',
          filter: 'blur(20px)',
        }}
        animate={{ opacity: [0.15, 0.3, 0.15] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* BRIGHT NEON BORDER — the actual 2px glowing edge */}
      <div
        className="relative overflow-hidden rounded-[18px] p-[2px]"
        style={{
          background: 'linear-gradient(135deg, #71bcfd 0%, #383eff 50%, #71bcfd 100%)',
          boxShadow: '0 0 12px rgba(113,188,253,0.5), inset 0 0 8px rgba(113,188,253,0.2)',
        }}
      >
      {/* INNER GAUSSIAN GLASS — deep blue, clear, frosted (matches image: #000061 base) */}
      <div
        className="relative overflow-hidden rounded-[16px]"
        style={{
          background: 'linear-gradient(180deg, rgba(0,0,40,0.85) 0%, rgba(0,0,97,0.9) 100%)',
          backdropFilter: 'blur(30px) saturate(180%)',
          WebkitBackdropFilter: 'blur(30px) saturate(180%)',
        }}
      >
        {/* Inner clear glass sheen — subtle top-to-bottom light refraction */}
        <div
          className="pointer-events-none absolute inset-0 rounded-[16px]"
          style={{
            background: 'linear-gradient(180deg, rgba(113,188,253,0.08) 0%, transparent 20%, transparent 80%, rgba(113,188,253,0.04) 100%)',
          }}
        />
        {/* Top edge neon line — the brightest part of the glow (matches image) */}
        <div
          className="pointer-events-none absolute top-0 left-2 right-2 h-[2px] rounded-full"
          style={{
            background: 'linear-gradient(90deg, transparent, #71bcfd 30%, #77cdff 50%, #71bcfd 70%, transparent)',
            boxShadow: '0 0 10px #71bcfd, 0 0 20px rgba(113,188,253,0.5)',
          }}
        />
        {/* Left edge neon line */}
        <div
          className="pointer-events-none absolute top-2 bottom-2 left-0 w-[1px] rounded-full"
          style={{
            background: 'linear-gradient(180deg, transparent, rgba(113,188,253,0.6) 30%, rgba(113,188,253,0.6) 70%, transparent)',
            boxShadow: '0 0 6px rgba(113,188,253,0.4)',
          }}
        />
        {/* Right edge neon line */}
        <div
          className="pointer-events-none absolute top-2 bottom-2 right-0 w-[1px] rounded-full"
          style={{
            background: 'linear-gradient(180deg, transparent, rgba(113,188,253,0.6) 30%, rgba(113,188,253,0.6) 70%, transparent)',
            boxShadow: '0 0 6px rgba(113,188,253,0.4)',
          }}
        />
        {/* Bottom edge neon line */}
        <div
          className="pointer-events-none absolute bottom-0 left-2 right-2 h-[1px] rounded-full"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(113,188,253,0.4) 30%, rgba(113,188,253,0.4) 70%, transparent)',
            boxShadow: '0 0 6px rgba(113,188,253,0.3)',
          }}
        />
      <div className={cn('relative rounded-[20px] p-5 sm:p-7', planningGlow)}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ background: 'rgba(89,147,255,0.15)', color: '#5993ff' }}
            >
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-white/60">
                Research Directive
              </div>
              <div className="text-[11px] text-white/35">
                Autonomous multi-agent execution
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(running || phase === 'final') && (
              <span
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider',
                  taskType === 'blueprint'
                    ? 'bg-orange-400/10 text-orange-300'
                    : 'bg-teal-400/10 text-teal-300',
                )}
                title={
                  taskType === 'blueprint'
                    ? 'Blueprint mode — agents produce the best actionable design using latest research'
                    : 'Research mode — agents form an independent, evidence-based conclusion (primary data only, no narrative adoption, definitive verdict)'
                }
              >
                {taskType === 'blueprint' ? (
                  <Wrench className="h-3 w-3" />
                ) : (
                  <Microscope className="h-3 w-3" />
                )}
                {taskType === 'blueprint' ? 'blueprint' : 'research'}
              </span>
            )}
            {degraded && (
              <span
                className="flex items-center gap-1.5 rounded-full bg-amber-400/10 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300"
                title="Primary LLM unavailable — running on no-LLM fallback"
              >
                <AlertTriangle className="h-3 w-3" />
                degraded
              </span>
            )}
            <span
              className={cn(
                'flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[10px] font-medium',
                routingTier === 'degraded'
                  ? 'bg-amber-400/10 text-amber-300'
                  : routingTier === 'local'
                    ? 'bg-sky-400/10 text-sky-300'
                    : 'bg-emerald-400/10 text-emerald-300',
              )}
              title={
                routingTier === 'degraded'
                  ? 'All inference tiers exhausted — no-LLM fallback active'
                  : routingTier === 'local'
                    ? 'Primary cloud gateway unavailable — served by local model tier (Ollama / LM Studio)'
                    : 'Primary cloud LLM pipeline active'
              }
            >
              <Cpu className="h-3 w-3" />
              {routingTier === 'degraded' ? 'degraded' : routingTier === 'local' ? 'local model' : 'primary'}
            </span>
            {running && (
              <span className="flex items-center gap-2 rounded-full bg-amber-400/10 px-3 py-1.5 text-[11px] font-medium text-amber-300">
                <Loader2 className="h-3 w-3 animate-spin" />
                {PHASE_LABELS[phase]} active
              </span>
            )}
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          {/* Attached files preview */}
          {attachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {attachedFiles.map((f, i) => (
                <div key={i} className="flex items-center gap-1.5 rounded-lg border border-sky-400/20 bg-sky-400/[0.06] px-2.5 py-1">
                  <Paperclip className="h-3 w-3 text-sky-300" />
                  <span className="max-w-[120px] truncate text-[10px] text-sky-200/80">{f.name}</span>
                  <button type="button" onClick={() => removeFile(i)} className="text-sky-300/50 hover:text-sky-200">
                    <span className="text-xs">&times;</span>
                  </button>
                </div>
              ))}
            </div>
          )}
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileUpload}
            className="hidden"
            accept=".txt,.md,.json,.csv,.py,.js,.ts,.jsx,.tsx,.html,.css,.xml,.yaml,.yml,.sql,.sh,.pdf,.doc,.docx"
          />
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={running}
            rows={3}
            placeholder="Describe a research goal — the Coordinator will decompose it, the Discovery agent will search the web, the Synthesis agent will draft a report, and the Critic will verify it…"
            className="scroll-fancy w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/90 placeholder:text-white/30 outline-none transition-colors focus:border-emerald-400/40 focus:bg-white/[0.06] disabled:opacity-60"
          />
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="submit"
              disabled={running || !query.trim()}
              className={cn(
                'group relative inline-flex items-center gap-2 overflow-hidden rounded-xl px-5 py-2.5 text-sm font-semibold transition-all',
                running || !query.trim()
                  ? 'cursor-not-allowed bg-white/5 text-white/30'
                  : 'bg-gradient-to-r from-[#383eff] to-[#00d4ff] text-white hover:shadow-[0_0_30px_-4px_rgba(56,62,255,0.6)]',
              )}
            >
              {running ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Rocket className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              )}
              {running ? 'Running…' : 'Launch Research'}
            </button>
            {(phase !== 'idle' || running) && (
              <button
                type="button"
                onClick={reset}
                disabled={running}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/60 transition-colors hover:bg-white/10 hover:text-white/80 disabled:opacity-40"
              >
                <RotateCcw className="h-4 w-4" />
                Reset
              </button>
            )}

            {/* Voice-to-text (Whisper) button */}
            <button
              type="button"
              onClick={toggleRecording}
              disabled={running || transcribing || !llmSettings?.voiceBoxUrl}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-medium transition-all',
                recording
                  ? 'border-rose-400/40 bg-rose-400/15 text-rose-300 animate-pulse'
                  : transcribing
                    ? 'border-amber-400/30 bg-amber-400/10 text-amber-300'
                    : 'border-sky-400/20 bg-sky-400/[0.06] text-sky-300 hover:bg-sky-400/15',
                (!llmSettings?.voiceBoxUrl) && 'opacity-30 cursor-not-allowed',
              )}
              title={llmSettings?.voiceBoxUrl ? 'Voice input (Whisper)' : 'Configure VoiceBox in Settings first'}
            >
              {recording ? (
                <Square className="h-3.5 w-3.5" />
              ) : transcribing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Mic className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">
                {recording ? 'Stop' : transcribing ? 'Transcribing...' : 'Voice'}
              </span>
            </button>

            {/* File upload button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={running}
              className="inline-flex items-center gap-1.5 rounded-xl border border-sky-400/20 bg-sky-400/[0.06] px-3 py-2.5 text-xs font-medium text-sky-300 transition-all hover:bg-sky-400/15 disabled:opacity-30"
              title="Attach files as context (.txt, .md, .json, .csv, .py, etc.)"
            >
              <Paperclip className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Attach</span>
              {attachedFiles.length > 0 && (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-sky-400/20 text-[9px] font-bold text-sky-200">
                  {attachedFiles.length}
                </span>
              )}
            </button>

            {/* Read report aloud (TTS) button */}
            {phase === 'final' && (
              <button
                type="button"
                onClick={speakReport}
                disabled={!llmSettings?.voiceBoxUrl}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-medium transition-all',
                  'border-violet-400/20 bg-violet-400/[0.06] text-violet-300 hover:bg-violet-400/15',
                  (!llmSettings?.voiceBoxUrl) && 'opacity-30 cursor-not-allowed',
                )}
                title={llmSettings?.voiceBoxUrl ? 'Read report aloud (TTS)' : 'Configure VoiceBox in Settings first'}
              >
                <Volume2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Read Aloud</span>
              </button>
            )}

            <div className="ml-auto hidden text-[11px] text-white/30 sm:block">
              ⏎ to launch
            </div>
          </div>
        </form>

        {/* Examples */}
        {!running && (
          <div className="mt-4 flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => setQuery(ex)}
                className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] text-white/55 transition-colors hover:border-emerald-400/30 hover:bg-emerald-400/[0.06] hover:text-emerald-200"
              >
                {ex}
              </button>
            ))}
          </div>
        )}

        {/* Phase pipeline */}
        {(running || phase === 'final') && (
          <div className="mt-5 border-t border-white/10 pt-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-white/40">
                Execution pipeline
              </span>
              <span className="text-[11px] text-white/50">{phaseTitle}</span>
            </div>
            <div className="flex items-center gap-1.5">
              {PHASE_FLOW.map((p, i) => {
                const done = phaseIndex > i || phase === 'final'
                const active = phaseIndex === i && phase !== 'final'
                return (
                  <div key={p.key} className="flex flex-1 items-center gap-1.5">
                    <div
                      className={cn(
                        'relative h-1.5 flex-1 rounded-full transition-all',
                        done ? 'bg-emerald-400/70' : active ? 'bg-amber-400/70' : 'bg-white/10',
                      )}
                    >
                      {active && (
                        <span className="absolute inset-0 animate-pulse rounded-full bg-amber-400/40" />
                      )}
                    </div>
                    <span
                      className={cn(
                        'w-14 shrink-0 text-[9px] font-medium uppercase tracking-wider transition-colors',
                        done
                          ? 'text-emerald-300'
                          : active
                            ? 'text-amber-300'
                            : 'text-white/25',
                      )}
                    >
                      {p.label}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
      </div>
      </div>
    </div>
  )
}
