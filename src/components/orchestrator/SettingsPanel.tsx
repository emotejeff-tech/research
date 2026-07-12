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

  // Merge server settings with local overrides — derived state, no effect needed.
  const form = useMemo(() => ({
    provider: overrides.provider ?? settings?.provider ?? 'zai',
    baseURL: overrides.baseURL ?? settings?.baseURL ?? '',
    apiKey: overrides.apiKey ?? settings?.apiKey ?? '',
    model: overrides.model ?? settings?.model ?? '',
    enabled: overrides.enabled ?? settings?.enabled ?? false,
    primary: overrides.primary ?? settings?.primary ?? false,
  }), [settings, overrides])

  const setField = (field: string, value: any) => {
    setOverrides((o) => ({ ...o, [field]: value }))
  }

  // When provider changes, apply preset defaults.
  const onProviderChange = (provider: string) => {
    const preset = presets?.[provider]
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

  const currentPreset = presets?.[form.provider]

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
                {presets &&
                  Object.entries(presets).map(([key, p]) => (
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
              Free tiers: Brave (2000/mo), Tavily (1000/mo), Exa (1000/mo).
            </p>
            <div className="space-y-2">
              <div>
                <label className="mb-1 block text-[10px] text-white/40">Brave Search API Key</label>
                <Input
                  type="password"
                  value={form.braveApiKey || ''}
                  onChange={(e) => setField('braveApiKey', e.target.value)}
                  placeholder="BSA... (get from brave.com/search/api)"
                  className="glass border-white/15 bg-white/5 font-mono text-[11px] text-white/90 placeholder:text-white/25"
                />
              </div>
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
            </div>
            <p className="mt-2 text-[9px] text-white/30">
              Without any keys, the system uses Z.ai + DuckDuckGo (both free, no key needed).
            </p>
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
