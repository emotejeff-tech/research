/**
 * tools/plugin_registry.ts — Persistent execution memory.
 *
 * Stores tool manifests durably in custom_plugins/registry.json so evolved
 * skills survive orchestrator restarts. At boot, loadSavedRegistry() reads
 * the JSON metadata + reconstructs full Plugin objects by reading the .py
 * files from disk. Every creation/execution updates usageCount, lastUsed,
 * and successRate, then persists immediately.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import type { Plugin } from '../types'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const PLUGIN_DIR = join(__dirname, '..', 'custom_plugins')
const REGISTRY_PATH = join(PLUGIN_DIR, 'registry.json')

/** Durable lifecycle metadata persisted to disk. */
export interface PluginMeta {
  name: string
  description: string
  language: string
  usageCount: number
  created: number
  lastUsed: number | null
  successRate: number // 0-1, rolling
  /** Self-Teaching Loop metadata (persisted so it survives restarts). */
  gapAnalysis?: string
  testStatus?: 'passed' | 'failed' | 'patched'
  executionStatus?: 'ok' | 'error' | 'not_run'
}

/** Seed tools written to registry.json on first boot. */
const SEED_TOOLS: PluginMeta[] = [
  {
    name: 'arxiv_fetcher',
    description: 'Fetch and summarize the latest arXiv abstracts for a topic.',
    language: 'python',
    usageCount: 0,
    created: Date.now() - 1000 * 60 * 60 * 24 * 2,
    lastUsed: null,
    successRate: 1.0,
  },
  {
    name: 'source_crossref',
    description: 'Cross-reference a claim against a list of source snippets.',
    language: 'python',
    usageCount: 0,
    created: Date.now() - 1000 * 60 * 60 * 24,
    lastUsed: null,
    successRate: 1.0,
  },
  {
    name: 'pdf_outline',
    description: 'Extract a plain-text outline from a PDF URL using stdlib only.',
    language: 'python',
    usageCount: 0,
    created: Date.now() - 1000 * 60 * 30,
    lastUsed: null,
    successRate: 1.0,
  },
]

/** Write the seed .py files for the core tools if they don't exist. */
function ensureSeedScripts() {
  if (!existsSync(PLUGIN_DIR)) mkdirSync(PLUGIN_DIR, { recursive: true })
  const seeds: Record<string, string> = {
    arxiv_fetcher: `import urllib.request, json, re

def fetch_arxiv(topic, max_results=5):
    url = f"http://export.arxiv.org/api/query?search_query=all:{topic}&max_results={max_results}"
    raw = urllib.request.urlopen(url, timeout=20).read().decode()
    titles = re.findall(r"<title>(.*?)</title>", raw, re.S)
    return titles[1:]

if __name__ == "__main__":
    import sys
    topic = sys.argv[1] if len(sys.argv) > 1 else "large language models"
    for t in fetch_arxiv(topic):
        print("-", t.strip())`,
    source_crossref: `import re, sys

def cross_reference(claim, sources):
    tokens = set(re.findall(r"\\w{4,}", claim.lower()))
    scored = []
    for s in sources:
        st = set(re.findall(r"\\w{4,}", s.lower()))
        overlap = len(tokens & st) / max(len(tokens), 1)
        scored.append((overlap, s))
    scored.sort(reverse=True)
    return scored[:3]

if __name__ == "__main__":
    claim = sys.argv[1] if len(sys.argv) > 1 else "renewable energy reduces emissions"
    srcs = ["Solar and wind lower CO2 output.", "Fossil fuels remain dominant."]
    for score, s in cross_reference(claim, srcs):
        print(f"{score:.2f}  {s}")`,
    pdf_outline: `import urllib.request, re, sys

def outline(url):
    raw = urllib.request.urlopen(url, timeout=30).read()
    text = raw.decode("latin-1")
    headings = re.findall(r"\\n([A-Z][A-Za-z0-9 ]{4,80})\\n", text)
    seen, out = set(), []
    for h in headings:
        if h not in seen:
            seen.add(h); out.append(h.strip())
    return out[:20]

if __name__ == "__main__":
    url = sys.argv[1] if len(sys.argv) > 1 else "https://example.com/paper.pdf"
    for h in outline(url):
        print("-", h)`,
  }
  for (const [name, code] of Object.entries(seeds)) {
    const p = join(PLUGIN_DIR, `${name}.py`)
    if (!existsSync(p)) writeFileSync(p, code, 'utf-8')
  }
}

/** Load the durable registry from disk, seeding on first boot. */
export function loadSavedRegistry(): Record<string, PluginMeta> {
  if (!existsSync(REGISTRY_PATH)) {
    ensureSeedScripts()
    const initial: Record<string, PluginMeta> = {}
    for (const s of SEED_TOOLS) initial[s.name] = s
    writeFileSync(REGISTRY_PATH, JSON.stringify(initial, null, 2), 'utf-8')
    console.log(`[registry] seeded ${Object.keys(initial).length} core tools → ${REGISTRY_PATH}`)
    return initial
  }
  try {
    const raw = readFileSync(REGISTRY_PATH, 'utf-8')
    const data = JSON.parse(raw) as Record<string, PluginMeta>
    // Migration: adopt orphaned .py files that exist on disk but aren't in the registry.
    if (existsSync(PLUGIN_DIR)) {
      const pyFiles = readdirSync(PLUGIN_DIR)
        .filter((f) => f.endsWith('.py'))
        .map((f) => f.replace(/\.py$/, ''))
      let adopted = 0
      for (const name of pyFiles) {
        if (!data[name]) {
          data[name] = {
            name,
            description: `Evolved tool (adopted from disk)`,
            language: 'python',
            usageCount: 0,
            created: Date.now(),
            lastUsed: null,
            successRate: 1.0,
          }
          adopted++
        }
      }
      if (adopted > 0) {
        writeFileSync(REGISTRY_PATH, JSON.stringify(data, null, 2), 'utf-8')
        console.log(`[registry] adopted ${adopted} orphaned tool(s) from disk`)
      }
    }
    console.log(`[registry] loaded ${Object.keys(data).length} tools from ${REGISTRY_PATH}`)
    return data
  } catch (e) {
    console.error('[registry] failed to load, re-seeding:', (e as Error).message)
    const initial: Record<string, PluginMeta> = {}
    for (const s of SEED_TOOLS) initial[s.name] = s
    writeFileSync(REGISTRY_PATH, JSON.stringify(initial, null, 2), 'utf-8')
    return initial
  }
}

/** Persist the full registry to disk. */
export function saveRegistry(registry: Record<string, PluginMeta>): void {
  if (!existsSync(PLUGIN_DIR)) mkdirSync(PLUGIN_DIR, { recursive: true })
  writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf-8')
}

/**
 * Reconstruct full Plugin objects (with code) from the durable registry +
 * the .py files on disk. Called at boot to populate the in-memory list.
 */
export function reconstructPlugins(registry: Record<string, PluginMeta>): Plugin[] {
  const plugins: Plugin[] = []
  for (const meta of Object.values(registry)) {
    const codePath = join(PLUGIN_DIR, `${meta.name}.py`)
    let code = ''
    if (existsSync(codePath)) {
      try {
        code = readFileSync(codePath, 'utf-8')
      } catch {
        code = `# source unavailable: ${meta.name}.py`
      }
    }
    plugins.push({
      id: `disk-${meta.name}`,
      name: meta.name,
      description: meta.description,
      language: meta.language || 'python',
      code,
      createdAt: meta.created,
      gapAnalysis: meta.gapAnalysis,
      testStatus: meta.testStatus,
      executionStatus: meta.executionStatus || 'not_run',
      usageCount: meta.usageCount,
      lastUsed: meta.lastUsed,
      successRate: meta.successRate,
    })
  }
  // newest first
  return plugins.sort((a, b) => b.createdAt - a.createdAt)
}

/**
 * Record a tool creation in the durable registry. Returns the updated meta.
 */
export function registerTool(
  registry: Record<string, PluginMeta>,
  plugin: Plugin,
): PluginMeta {
  const meta: PluginMeta = {
    name: plugin.name,
    description: plugin.description,
    language: plugin.language,
    usageCount: 1, // count its birth execution
    created: plugin.createdAt,
    lastUsed: Date.now(),
    successRate: plugin.executionStatus === 'ok' ? 1.0 : 0.0,
    gapAnalysis: plugin.gapAnalysis,
    testStatus: plugin.testStatus,
    executionStatus: plugin.executionStatus,
  }
  registry[plugin.name] = meta
  saveRegistry(registry)
  return meta
}

/**
 * Record a tool execution: increment usageCount, update lastUsed, and
 * update the rolling successRate. Returns the updated meta.
 */
export function recordToolExecution(
  registry: Record<string, PluginMeta>,
  toolName: string,
  success: boolean,
): PluginMeta | null {
  const meta = registry[toolName]
  if (!meta) return null
  meta.usageCount += 1
  meta.lastUsed = Date.now()
  // Rolling success rate: weighted average favoring recent executions.
  const prevWeight = meta.usageCount - 1
  const newRate =
    prevWeight > 0
      ? (meta.successRate * prevWeight + (success ? 1 : 0)) / meta.usageCount
      : success
        ? 1
        : 0
  meta.successRate = Math.round(newRate * 100) / 100
  saveRegistry(registry)
  return meta
}

/** Read the code for a tool from disk (for display in the UI). */
export function readToolCode(toolName: string): string {
  const p = join(PLUGIN_DIR, `${toolName}.py`)
  if (!existsSync(p)) return ''
  try {
    return readFileSync(p, 'utf-8')
  } catch {
    return ''
  }
}
