'use client'

import { useState, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Settings as SettingsIcon,
  X,
  Server,
  Key,
  Cpu,
  RefreshCw,
  Check,
  AlertCircle,
  ChevronDown,
  Zap,
  Search,
  ShieldCheck,
  Database,
  Volume2,
  Mic,
} from 'lucide-react'
import { useOrchestrator } from '@/lib/orchestrator-store'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'

export default function SettingsPanel() {
  const open = useOrchestrator((s) => s.settingsOpen)
  const setOpen = useOrchestrator((s) => s.setSettingsOpen)
  const settings = useOrchestrator((s) => s.llmSettings)
  const presets = useOrchestrator((s) => s.providerPresets)
  const availableModels = useOrchestrator((s) => s.availableModels)
  const save = useOrchestrator((s) => s.saveLLMSettings)
  const fetchModels = useOrchestrator((s) => s.fetchProviderModels)

  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [overrides, setOverrides] = useState<Record<string, any>>({})
  const [ttsTesting, setTtsTesting] = useState(false)
  const [ttsResult, setTtsResult] = useState<'success' | 'error' | null>(null)
  const [sttTesting, setSttTesting] = useState(false)
  const [sttResult, setSttResult] = useState<string | 'error' | 'Mic blocked' | null>(null)

  // Merge server settings with local overrides — derived state, no effect needed.
  const form = useMemo(() => ({
    provider: overrides.provider ?? settings?.provider ?? 'zai',
    baseURL: overrides.baseURL ?? settings?.baseURL ?? '',
    apiKey: overrides.apiKey ?? settings?.apiKey ?? '',
    model: overrides.model ?? settings?.model ?? '',
    enabled: overrides.enabled ?? settings?.enabled ?? false,
    primary: overrides.primary ?? settings?.primary ?? false,
    maxContextTokens: overrides.maxContextTokens ?? settings?.maxContextTokens ?? 8192,
    temperature: overrides.temperature ?? settings?.temperature ?? 0.7,
    jsonMode: overrides.jsonMode ?? settings?.jsonMode ?? true,
    criticEnabled: overrides.criticEnabled ?? settings?.criticEnabled ?? true,
    critiqueIterations: overrides.critiqueIterations ?? settings?.critiqueIterations ?? 3,
    planningModel: overrides.planningModel ?? settings?.planningModel ?? '',
    planningEndpoint: overrides.planningEndpoint ?? settings?.planningEndpoint ?? '',
    tavilyApiKey: overrides.tavilyApiKey ?? settings?.tavilyApiKey ?? '',
    exaApiKey: overrides.exaApiKey ?? settings?.exaApiKey ?? '',
    youcomApiKey: overrides.youcomApiKey ?? settings?.youcomApiKey ?? '',
    tinyfishApiKey: overrides.tinyfishApiKey ?? settings?.tinyfishApiKey ?? '',
    nimblerApiKey: overrides.nimblerApiKey ?? settings?.nimblerApiKey ?? '',
    daytonaApiKey: overrides.daytonaApiKey ?? settings?.daytonaApiKey ?? '',
    daytonaServerUrl: overrides.daytonaServerUrl ?? settings?.daytonaServerUrl ?? '',
    e2bApiKey: overrides.e2bApiKey ?? settings?.e2bApiKey ?? '',
    supabaseUrl: overrides.supabaseUrl ?? settings?.supabaseUrl ?? '',
    supabaseKey: overrides.supabaseKey ?? settings?.supabaseKey ?? '',
    pineconeApiKey: overrides.pineconeApiKey ?? settings?.pineconeApiKey ?? '',
    pineconeIndex: overrides.pineconeIndex ?? settings?.pineconeIndex ?? '',
    voiceBoxUrl: overrides.voiceBoxUrl ?? settings?.voiceBoxUrl ?? '',
    voiceBoxApiKey: overrides.voiceBoxApiKey ?? settings?.voiceBoxApiKey ?? '',
    voiceBoxEnabled: overrides.voiceBoxEnabled ?? settings?.voiceBoxEnabled ?? false,
    ttsModel: overrides.ttsModel ?? settings?.ttsModel ?? 'kokoro',
    ttsVoice: overrides.ttsVoice ?? settings?.ttsVoice ?? 'af_heart',
    whisperModel: overrides.whisperModel ?? settings?.whisperModel ?? 'whisper-1',
  }), [settings, overrides])

  const setField = (field: string, value: any) => {
    setOverrides((o) => ({ ...o, [field]: value }))
  }

  // When provider changes, apply preset defaults.
  const onProviderChange = (provider: string) => {
    const preset = presets?.[provider] ?? presetsFallback?.[provider]
    if (preset) {
      setOverrides((o) => ({
        ...o,
        provider,
        baseURL: preset.defaultURL,
        apiKey: preset.defaultKey,
        model: preset.defaultModel,
      }))
    } else {
      setOverrides((o) => ({ ...o, provider }))
    }
    setFetchError(null)
  }

  const onFetchModels = async () => {
    setFetching(true)
    setFetchError(null)
    fetchModels(form.provider, form.baseURL, form.apiKey)
    // The models arrive asynchronously via the settings:models socket event.
    // We set a timeout to stop the spinner if the server doesn't respond.
    setTimeout(() => setFetching(false), 6000)
  }

  // Auto-select the first model when models arrive (if none selected).
  // This is derived state, not an effect — computed during render.
  const effectiveModel = form.model || (availableModels.length > 0 ? availableModels[0] : '')
  // Stop fetching when models arrive.
  if (fetching && availableModels.length > 0) {
    setTimeout(() => setFetching(false), 0)
  }

  const onSave = () => {
    save({ ...form, model: effectiveModel })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  // Fallback presets if socket not connected yet
  const presetsFallback = {
    zai: { label: 'Z.ai (Built-in)', defaultURL: '', defaultKey: '', defaultModel: '', needsKey: false, help: 'Default cloud gateway. No configuration needed.' },
    ollama: { label: 'Ollama', defaultURL: 'http://localhost:11434/v1', defaultKey: '', defaultModel: 'llama3.2', needsKey: false, help: 'Local Ollama server.' },
    lmstudio: { label: 'LM Studio', defaultURL: 'http://localhost:1234/v1', defaultKey: '', defaultModel: 'local-model', needsKey: false, help: 'Local LM Studio server.' },
    openrouter: { label: 'OpenRouter', defaultURL: 'https://openrouter.ai/api/v1', defaultKey: '', defaultModel: 'meta-llama/llama-3.2-3b-instruct:free', needsKey: true, help: 'Cloud router with free + paid models.' },
  }

  const currentPreset = presets?.[form.provider] ?? presetsFallback?.[form.provider]

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="glass-strong max-h-[85vh] overflow-y-auto scroll-fancy border-white/15 bg-[#0a0f1e]/95 p-0 backdrop-blur-2xl">
        <DialogHeader className="border-b border-white/10 px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold text-white">
            <SettingsIcon className="h-4 w-4 text-emerald-400" />
            LLM Provider Settings
          </DialogTitle>
          <p className="text-[11px] text-white/45">
            Configure your local or cloud inference backend. Auto-fetches available models.
          </p>
        </DialogHeader>

        <div className="space-y-5 p-6">
          {/* Provider Selection */}
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/50">
              <Server className="h-3 w-3" /> Provider
            </label>
            <Select value={form.provider} onValueChange={onProviderChange}>
              <SelectTrigger className="glass border-white/15 bg-white/5 text-white/90 hover:bg-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="glass-strong border-white/15 bg-[#0a0f1e]/95">
                {Object.entries(presets || {
                  zai: { label: 'Z.ai (Built-in)', defaultURL: '', defaultKey: '', defaultModel: '', needsKey: false, help: 'Default cloud gateway. No configuration needed.' },
                  ollama: { label: 'Ollama', defaultURL: 'http://localhost:11434/v1', defaultKey: '', defaultModel: 'llama3.2', needsKey: false, help: 'Local Ollama server.' },
                  lmstudio: { label: 'LM Studio', defaultURL: 'http://localhost:1234/v1', defaultKey: '', defaultModel: 'local-model', needsKey: false, help: 'Local LM Studio server.' },
                  openrouter: { label: 'OpenRouter', defaultURL: 'https://openrouter.ai/api/v1', defaultKey: '', defaultModel: 'meta-llama/llama-3.2-3b-instruct:free', needsKey: true, help: 'Cloud router with free + paid models.' },
                }).map(([key, p]) => (
                    <SelectItem
                      key={key}
                      value={key}
                      className="text-white/80 focus:bg-white/10 focus:text-white"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{p.label}</span>
                        {key === 'zai' && (
                          <Badge variant="secondary" className="bg-emerald-400/15 text-[9px] text-emerald-300">
                            default
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {currentPreset && (
              <p className="mt-1.5 text-[10px] leading-relaxed text-white/35">
                {currentPreset.help}
              </p>
            )}
          </div>

          {/* Only show connection fields for non-zai providers */}
          {form.provider !== 'zai' && (
            <>
              {/* Enable toggle */}
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div>
                  <div className="text-[12px] font-medium text-white/80">Enable as fallback tier</div>
                  <p className="text-[10px] text-white/40">
                    When enabled, this provider is used as Tier 2 if the Z.ai cloud is unavailable.
                  </p>
                </div>
                <Switch
                  checked={form.enabled}
                  onCheckedChange={(v) => setField('enabled', v)}
                />
              </div>

              {/* Use as PRIMARY engine toggle */}
              <div className="flex items-center justify-between rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05] p-3">
                <div>
                  <div className="text-[12px] font-medium text-emerald-200">Use as PRIMARY engine</div>
                  <p className="text-[10px] text-white/40">
                    Skip Z.ai entirely and use this provider for ALL LLM calls. Required if you don't have a Z.ai config file.
                  </p>
                </div>
                <Switch
                  checked={form.primary}
                  onCheckedChange={(v) => setField('primary', v)}
                />
              </div>

              {/* Context Window + Temperature */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[10px] text-white/40">Context Window (tokens)</label>
                  <select
                    value={form.maxContextTokens}
                    onChange={(e) => setField('maxContextTokens', parseInt(e.target.value))}
                    className="glass w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-[12px] text-white/90 outline-none"
                  >
                    <option value={2048}>2,048 (fastest)</option>
                    <option value={4096}>4,096</option>
                    <option value={8192}>8,192 (default)</option>
                    <option value={16384}>16,384</option>
                    <option value={32768}>32,768</option>
                    <option value={65536}>65,536</option>
                    <option value={131072}>131,072 (max)</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] text-white/40">Temperature</label>
                  <select
                    value={form.temperature}
                    onChange={(e) => setField('temperature', parseFloat(e.target.value))}
                    className="glass w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-[12px] text-white/90 outline-none"
                  >
                    <option value={0}>0 (deterministic)</option>
                    <option value={0.3}>0.3 (focused)</option>
                    <option value={0.7}>0.7 (balanced)</option>
                    <option value={1.0}>1.0 (creative)</option>
                    <option value={1.5}>1.5 (wild)</option>
                    <option value={2.0}>2.0 (chaotic)</option>
                  </select>
                </div>
              </div>

              {/* JSON Mode toggle */}
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div>
                  <div className="text-[12px] font-medium text-white/80">JSON Mode</div>
                  <p className="text-[10px] text-white/40">
                    Forces the model to return valid JSON for Critic, Evolution, and Planner calls. Prevents pipeline parse errors with local models.
                  </p>
                </div>
                <Switch
                  checked={form.jsonMode}
                  onCheckedChange={(v) => setField('jsonMode', v)}
                />
              </div>

              {/* Critic Controls */}
              <div className="flex items-center justify-between rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-3">
                <div>
                  <div className="text-[12px] font-medium text-white/80">Enable Critic Loop</div>
                  <p className="text-[10px] text-white/40">
                    When enabled, the Critic validates and iteratively refines drafts. Disable to skip critique for faster runs.
                  </p>
                </div>
                <Switch
                  checked={form.criticEnabled !== false}
                  onCheckedChange={(v) => setField('criticEnabled', v)}
                />
              </div>

              {form.criticEnabled !== false && (
                <div>
                  <label className="mb-1 block text-[10px] text-white/40">Max Critique Iterations</label>
                  <select
                    value={form.critiqueIterations || 3}
                    onChange={(e) => setField('critiqueIterations', parseInt(e.target.value))}
                    className="glass w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-[12px] text-white/90 outline-none"
                  >
                    <option value={1}>1 (fastest)</option>
                    <option value={2}>2 (balanced)</option>
                    <option value={3}>3 (thorough)</option>
                  </select>
                </div>
              )}

              {/* Hybrid routing: lightweight planning model (saves VRAM) */}
              <div className="rounded-xl border border-violet-400/15 bg-violet-400/[0.04] p-3">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-violet-300/70">
                  Hybrid Routing (optional) - lightweight model for Planning/Discovery
                </div>
                <p className="mb-2 text-[9px] text-white/35">
                  Route Coordinator/Planner calls to a smaller, faster model to save VRAM. Leave empty to use the primary model for everything.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-[10px] text-white/40">Planning Model Name</label>
                    <Input
                      type="text"
                      value={form.planningModel || ''}
                      onChange={(e) => setField('planningModel', e.target.value)}
                      placeholder="deepseek-r1:7b (optional)"
                      className="glass border-white/15 bg-white/5 font-mono text-[11px] text-white/90 placeholder:text-white/25"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] text-white/40">Planning Endpoint (optional)</label>
                    <Input
                      type="text"
                      value={form.planningEndpoint || ''}
                      onChange={(e) => setField('planningEndpoint', e.target.value)}
                      placeholder="http://localhost:11434/v1 (optional)"
                      className="glass border-white/15 bg-white/5 font-mono text-[11px] text-white/90 placeholder:text-white/25"
                    />
                  </div>
                </div>
              </div>

              {/* Base URL */}
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/50">
                  <Server className="h-3 w-3" /> Base URL
                </label>
                <Input
                  value={form.baseURL}
                  onChange={(e) => setField('baseURL', e.target.value)}
                  placeholder="http://localhost:11434/v1"
                  className="glass border-white/15 bg-white/5 font-mono text-[12px] text-white/90 placeholder:text-white/25"
                />
              </div>

              {/* API Key */}
              {currentPreset?.needsKey && (
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/50">
                    <Key className="h-3 w-3" /> API Key
                  </label>
                  <Input
                    type="password"
                    value={form.apiKey}
                    onChange={(e) => setField('apiKey', e.target.value)}
                    placeholder="sk-or-..."
                    className="glass border-white/15 bg-white/5 font-mono text-[12px] text-white/90 placeholder:text-white/25"
                  />
                </div>
              )}

              {/* Model Selection with auto-fetch */}
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/50">
                  <Cpu className="h-3 w-3" /> Model
                </label>
                <div className="flex gap-2">
                  {availableModels.length > 0 ? (
                    <Select value={effectiveModel} onValueChange={(v) => setField('model', v)}>
                      <SelectTrigger className="glass flex-1 border-white/15 bg-white/5 text-white/90 hover:bg-white/10">
                        <SelectValue placeholder="Select a model…" />
                      </SelectTrigger>
                      <SelectContent className="glass-strong max-h-60 border-white/15 bg-[#0a0f1e]/95">
                        {availableModels.map((m) => (
                          <SelectItem
                            key={m}
                            value={m}
                            className="font-mono text-[11px] text-white/80 focus:bg-white/10 focus:text-white"
                          >
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={form.model}
                      onChange={(e) => setField('model', e.target.value)}
                      placeholder="model name (or fetch auto)"
                      className="glass flex-1 border-white/15 bg-white/5 font-mono text-[12px] text-white/90 placeholder:text-white/25"
                    />
                  )}
                  <Button
                    onClick={onFetchModels}
                    disabled={fetching || !form.baseURL}
                    variant="outline"
                    className="glass shrink-0 border-emerald-400/30 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20"
                  >
                    {fetching ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Zap className="h-3.5 w-3.5" />
                    )}
                    <span className="ml-1.5 text-[11px]">Fetch</span>
                  </Button>
                </div>
                {availableModels.length > 0 && (
                  <p className="mt-1 flex items-center gap-1 text-[10px] text-emerald-300/70">
                    <Check className="h-2.5 w-2.5" />
                    Found {availableModels.length} model(s)
                  </p>
                )}
                {fetchError && (
                  <p className="mt-1 flex items-center gap-1 text-[10px] text-rose-300/70">
                    <AlertCircle className="h-2.5 w-2.5" />
                    {fetchError}
                  </p>
                )}
                {fetching && (
                  <p className="mt-1 flex items-center gap-1 text-[10px] text-amber-300/70">
                    <RefreshCw className="h-2.5 w-2.5 animate-spin" />
                    Fetching models from {form.provider}…
                  </p>
                )}
              </div>
            </>
          )}

          {/* Search API Keys (optional — enables multi-provider search) */}
          <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-4">
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-300">
              <Search className="h-3 w-3" /> Search API Keys (optional)
            </div>
            <p className="mb-3 text-[10px] text-white/40">
              Add keys to enable multi-provider search aggregation. All configured
              providers are queried in parallel and results are merged + deduplicated.
              Free tiers: Tavily (1000/mo), Exa (1000/mo), You.com, TinyFish, Nimbler.
            </p>
            <div className="space-y-2">
              <div>
                <label className="mb-1 block text-[10px] text-white/40">Tavily API Key</label>
                <Input
                  type="password"
                  value={form.tavilyApiKey || ''}
                  onChange={(e) => setField('tavilyApiKey', e.target.value)}
                  placeholder="tvly-... (get from tavily.com)"
                  className="glass border-white/15 bg-white/5 font-mono text-[11px] text-white/90 placeholder:text-white/25"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-white/40">Exa API Key</label>
                <Input
                  type="password"
                  value={form.exaApiKey || ''}
                  onChange={(e) => setField('exaApiKey', e.target.value)}
                  placeholder="exa-... (get from exa.ai)"
                  className="glass border-white/15 bg-white/5 font-mono text-[11px] text-white/90 placeholder:text-white/25"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-white/40">You.com API Key</label>
                <Input
                  type="password"
                  value={form.youcomApiKey || ''}
                  onChange={(e) => setField('youcomApiKey', e.target.value)}
                  placeholder="ydc-... (get from api.ydc-index.io)"
                  className="glass border-white/15 bg-white/5 font-mono text-[11px] text-white/90 placeholder:text-white/25"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-white/40">TinyFish API Key</label>
                <Input
                  type="password"
                  value={form.tinyfishApiKey || ''}
                  onChange={(e) => setField('tinyfishApiKey', e.target.value)}
                  placeholder="tf-... (get from tinyfish.io)"
                  className="glass border-white/15 bg-white/5 font-mono text-[11px] text-white/90 placeholder:text-white/25"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-white/40">Nimbler API Key</label>
                <Input
                  type="password"
                  value={form.nimblerApiKey || ''}
                  onChange={(e) => setField('nimblerApiKey', e.target.value)}
                  placeholder="nb-... (get from nimbler.io)"
                  className="glass border-white/15 bg-white/5 font-mono text-[11px] text-white/90 placeholder:text-white/25"
                />
              </div>
            </div>
            <p className="mt-2 text-[9px] text-white/30">
              Without any keys, the system uses Z.ai + DuckDuckGo (both free, no key needed).
            </p>
          </div>

          {/* Sandbox API Keys (optional — isolated execution of evolved tools) */}
          <div className="rounded-xl border border-rose-400/20 bg-rose-400/[0.04] p-4">
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-rose-300">
              <ShieldCheck className="h-3 w-3" /> Sandbox Execution (optional)
            </div>
            <p className="mb-3 text-[10px] text-white/40">
              When configured, evolved Python tools execute in an isolated cloud
              sandbox instead of your local machine. This creates a hard security
              boundary — if the agent hallucinates destructive code, it only
              affects the ephemeral sandbox. Priority: E2B {'->'} Daytona {'->'} local.
            </p>
            <div className="space-y-2">
              <div>
                <label className="mb-1 block text-[10px] text-white/40">E2B API Key (Python-native sandbox)</label>
                <Input
                  type="password"
                  value={form.e2bApiKey || ''}
                  onChange={(e) => setField('e2bApiKey', e.target.value)}
                  placeholder="e2b-... (get from e2b.dev)"
                  className="glass border-white/15 bg-white/5 font-mono text-[11px] text-white/90 placeholder:text-white/25"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-white/40">Daytona API Key (full VM sandbox)</label>
                <Input
                  type="password"
                  value={form.daytonaApiKey || ''}
                  onChange={(e) => setField('daytonaApiKey', e.target.value)}
                  placeholder="dt-... (get from daytona.io)"
                  className="glass border-white/15 bg-white/5 font-mono text-[11px] text-white/90 placeholder:text-white/25"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-white/40">Daytona Server URL (optional, self-hosted)</label>
                <Input
                  type="text"
                  value={form.daytonaServerUrl || ''}
                  onChange={(e) => setField('daytonaServerUrl', e.target.value)}
                  placeholder="https://api.daytona.io (default) or https://your-server.com"
                  className="glass border-white/15 bg-white/5 font-mono text-[11px] text-white/90 placeholder:text-white/25"
                />
              </div>
            </div>
            <p className="mt-2 text-[9px] text-white/30">
              Without keys, tools execute locally via python3. With keys, tools run in an isolated sandbox and the VM is destroyed after each execution.
            </p>
          </div>

          {/* Database Keys (optional — persistent cloud vector memory) */}
          <div className="rounded-xl border border-violet-400/20 bg-violet-400/[0.04] p-4">
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-violet-300">
              <Database className="h-3 w-3" /> Cloud Vector Memory (optional)
            </div>
            <p className="mb-3 text-[10px] text-white/40">
              When configured, research conclusions are stored in a cloud vector
              database for scalable RAG retrieval. Pinecone enables fast
              semantic search across all past runs. Supabase provides a
              persistent SQL backup. Without keys, the system uses a local
              JSON file (limited to 200 entries).
            </p>
            <div className="space-y-2">
              <div>
                <label className="mb-1 block text-[10px] text-white/40">Pinecone API Key</label>
                <Input
                  type="password"
                  value={form.pineconeApiKey || ''}
                  onChange={(e) => setField('pineconeApiKey', e.target.value)}
                  placeholder="pc-... (get from pinecone.io)"
                  className="glass border-white/15 bg-white/5 font-mono text-[11px] text-white/90 placeholder:text-white/25"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-white/40">Pinecone Index Name</label>
                <Input
                  type="text"
                  value={form.pineconeIndex || ''}
                  onChange={(e) => setField('pineconeIndex', e.target.value)}
                  placeholder="nexus-memory (create in Pinecone console)"
                  className="glass border-white/15 bg-white/5 font-mono text-[11px] text-white/90 placeholder:text-white/25"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-white/40">Supabase URL</label>
                <Input
                  type="text"
                  value={form.supabaseUrl || ''}
                  onChange={(e) => setField('supabaseUrl', e.target.value)}
                  placeholder="https://xxx.supabase.co (get from supabase.com)"
                  className="glass border-white/15 bg-white/5 font-mono text-[11px] text-white/90 placeholder:text-white/25"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-white/40">Supabase Anon Key</label>
                <Input
                  type="password"
                  value={form.supabaseKey || ''}
                  onChange={(e) => setField('supabaseKey', e.target.value)}
                  placeholder="eyJ... (get from supabase.com dashboard)"
                  className="glass border-white/15 bg-white/5 font-mono text-[11px] text-white/90 placeholder:text-white/25"
                />
              </div>
            </div>
            <p className="mt-2 text-[9px] text-white/30">
              Requires a 'conclusions' table in Supabase (id text, query text, conclusion text, text text, timestamp bigint).
            </p>
          </div>

          {/* VoiceBox (local TTS + Whisper) */}
          <div className="rounded-xl border border-sky-400/20 bg-sky-400/[0.04] p-4">
            <div className="mb-1 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-sky-300">
                <Volume2 className="h-3 w-3" /> VoiceBox - TTS + Whisper (optional)
              </div>
              <Switch
                checked={form.voiceBoxEnabled}
                onCheckedChange={(v) => setField('voiceBoxEnabled', v)}
              />
            </div>
            <p className="mb-3 text-[10px] text-white/40">
              When enabled, the agent announces phase changes and critical
              failures via text-to-speech. Also enables Whisper speech-to-text
              for future voice commands. Works with any OpenAI-compatible TTS
              endpoint (VoiceBox, LocalAI, Ollama with TTS, etc.).
            </p>
            <div className="space-y-2">
              <div>
                <label className="mb-1 block text-[10px] text-white/40">VoiceBox Server URL</label>
                <Input
                  type="text"
                  value={form.voiceBoxUrl || ''}
                  onChange={(e) => setField('voiceBoxUrl', e.target.value)}
                  placeholder="http://127.0.0.1:17493 (FastAPI TTS) or http://localhost:5001 (VoiceBox)"
                  className="glass border-white/15 bg-white/5 font-mono text-[11px] text-white/90 placeholder:text-white/25"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-white/40">API Key (optional, if your server requires it)</label>
                <Input
                  type="password"
                  value={form.voiceBoxApiKey || ''}
                  onChange={(e) => setField('voiceBoxApiKey', e.target.value)}
                  placeholder="(leave empty if no auth required)"
                  className="glass border-white/15 bg-white/5 font-mono text-[11px] text-white/90 placeholder:text-white/25"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="mb-1 block text-[10px] text-white/40">TTS Model</label>
                  <Input
                    type="text"
                    value={form.ttsModel || ''}
                    onChange={(e) => setField('ttsModel', e.target.value)}
                    placeholder="tts-1"
                    className="glass border-white/15 bg-white/5 font-mono text-[11px] text-white/90 placeholder:text-white/25"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] text-white/40">TTS Voice</label>
                  <Input
                    type="text"
                    value={form.ttsVoice || ''}
                    onChange={(e) => setField('ttsVoice', e.target.value)}
                    placeholder="alloy"
                    className="glass border-white/15 bg-white/5 font-mono text-[11px] text-white/90 placeholder:text-white/25"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] text-white/40">Whisper Model</label>
                  <Input
                    type="text"
                    value={form.whisperModel || ''}
                    onChange={(e) => setField('whisperModel', e.target.value)}
                    placeholder="whisper-1"
                    className="glass border-white/15 bg-white/5 font-mono text-[11px] text-white/90 placeholder:text-white/25"
                  />
                </div>
              </div>
            </div>
            <p className="mt-2 text-[9px] text-white/30">
              Works with any TTS server: FastAPI TTS (port 17493), VoiceBox, LocalAI, or OpenAI-compatible.
              The system auto-detects the endpoint format (/v1/audio/speech, /api/tts, /tts).
              Check your TTS server docs at http://127.0.0.1:17493/docs for the exact endpoint.
            </p>
            {/* Test TTS + STT buttons */}
            <div className="mt-3 flex gap-2">
              <Button
                onClick={async () => {
                  setTtsTesting(true)
                  try {
                    const res = await fetch('/api/test-tts', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        url: form.voiceBoxUrl,
                        apiKey: form.voiceBoxApiKey,
                        model: form.ttsModel || 'tts-1',
                        voice: form.ttsVoice || 'alloy',
                        text: 'NEXUS text to speech is working. The autonomous research engine is online.',
                      }),
                    })
                    const data = await res.json()
                    if (data.ok && data.audio) {
                      const audio = new Audio(`data:audio/mp3;base64,${data.audio}`)
                      audio.play()
                      setTtsResult('success')
                    } else {
                      setTtsResult('error')
                    }
                  } catch {
                    setTtsResult('error')
                  }
                  setTtsTesting(false)
                  setTimeout(() => setTtsResult(null), 3000)
                }}
                disabled={ttsTesting || !form.voiceBoxUrl}
                variant="outline"
                className="glass border-sky-400/30 bg-sky-400/10 text-sky-300 hover:bg-sky-400/20"
              >
                {ttsTesting ? (
                  <RefreshCw className="mr-1.5 h-3 w-3 animate-spin" />
                ) : ttsResult === 'success' ? (
                  <Check className="mr-1.5 h-3 w-3" />
                ) : ttsResult === 'error' ? (
                  <AlertCircle className="mr-1.5 h-3 w-3" />
                ) : (
                  <Volume2 className="mr-1.5 h-3 w-3" />
                )}
                <span className="text-[11px]">
                  {ttsTesting ? 'Testing...' : ttsResult === 'success' ? 'TTS Works!' : ttsResult === 'error' ? 'TTS Failed' : 'Test TTS'}
                </span>
              </Button>
              <Button
                onClick={async () => {
                  setSttTesting(true)
                  try {
                    // Record 3 seconds of audio from microphone
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
                    const recorder = new MediaRecorder(stream)
                    const chunks: Blob[] = []
                    recorder.ondataavailable = (e) => chunks.push(e.data)
                    recorder.start()

                    setTimeout(async () => {
                      recorder.stop()
                      stream.getTracks().forEach((t) => t.stop())
                      const blob = new Blob(chunks, { type: 'audio/webm' })
                      const reader = new FileReader()
                      reader.onloadend = async () => {
                        const base64 = (reader.result as string).split(',')[1]
                        const res = await fetch('/api/test-stt', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            url: form.voiceBoxUrl,
                            apiKey: form.voiceBoxApiKey,
                            model: form.whisperModel || 'whisper-1',
                            audio: base64,
                          }),
                        })
                        const data = await res.json()
                        if (data.ok && data.text) {
                          setSttResult(`Heard: "${data.text.slice(0, 60)}"`)
                        } else {
                          setSttResult('error')
                        }
                        setSttTesting(false)
                        setTimeout(() => setSttResult(null), 5000)
                      }
                      reader.readAsDataURL(blob)
                    }, 3000)
                  } catch {
                    setSttResult('Mic blocked')
                    setSttTesting(false)
                    setTimeout(() => setSttResult(null), 3000)
                  }
                }}
                disabled={sttTesting || !form.voiceBoxUrl}
                variant="outline"
                className="glass border-sky-400/30 bg-sky-400/10 text-sky-300 hover:bg-sky-400/20"
              >
                {sttTesting ? (
                  <RefreshCw className="mr-1.5 h-3 w-3 animate-spin" />
                ) : (
                  <Mic className="mr-1.5 h-3 w-3" />
                )}
                <span className="text-[11px]">
                  {sttTesting ? 'Speak now (3s)...' : typeof sttResult === 'string' && sttResult !== 'error' && sttResult !== 'Mic blocked' ? sttResult : sttResult === 'error' ? 'STT Failed' : sttResult === 'Mic blocked' ? 'Mic Blocked' : 'Test Whisper'}
                </span>
              </Button>
            </div>
          </div>

          {/* Save button */}
          <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-4">
            <div className="text-[10px] text-white/35">
              {form.provider === 'zai'
                ? 'Using the built-in Z.ai cloud gateway — no configuration needed.'
                : form.primary
                  ? `PRIMARY engine: ${form.provider} / ${form.model || '(no model)'} — Z.ai skipped entirely`
                  : form.enabled
                    ? `Fallback tier: ${form.provider} / ${form.model || '(no model)'}`
                    : 'Provider configured but not enabled.'}
            </div>
            <Button
              onClick={onSave}
              className="bg-gradient-to-r from-emerald-400 to-amber-400 text-black hover:shadow-[0_0_24px_-4px_rgba(52,211,153,0.5)]"
            >
              {saved ? (
                <>
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                  Saved
                </>
              ) : (
                'Save Settings'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
