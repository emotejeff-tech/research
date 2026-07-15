/**
 * tools/plugin_registry.ts — Persistent plugin registry for INTELLAGENT.
 *
 * This is the durable plugin store. Plugins can be:
 *   - user-created (saved as .py files in custom_plugins/)
 *   - agent-generated (via Evolution Engine)
 *   - auto-discovered from disk
 *
 * The registry persists metadata so plugins survive restarts.
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
  source?: 'seed' | 'agent' | 'user' | 'auto'
  version?: string
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
    source: 'seed',
    version: '1.0.0',
  },
  {
    name: 'source_crossref',
    description: 'Cross-reference a claim against a list of source snippets.',
    language: 'python',
    usageCount: 0,
    created: Date.now() - 1000 * 60 * 60 * 24,
    lastUsed: null,
    successRate: 1.0,
    source: 'seed',
    version: '1.0.0',
  },
  {
    name: 'pdf_outline',
    description: 'Extract a plain-text outline from a PDF URL using stdlib only.',
    language: 'python',
    usageCount: 0,
    created: Date.now() - 1000 * 60 * 30,
    lastUsed: null,
    successRate: 1.0,
    source: 'seed',
    version: '1.0.0',
  },
  {
    name: 'opsec_log_scrubber',
    description: 'Scrub environment variables, local filesystem signatures, and API tokens out of log streams before external transmission.',
    language: 'python',
    usageCount: 0,
    created: Date.now() - 1000 * 60 * 20,
    lastUsed: null,
    successRate: 1.0,
    gapAnalysis: 'OPSEC: prevent credential/path leakage in research outputs',
    source: 'seed',
    version: '1.0.0',
  },
  {
    name: 'ua_rotator',
    description: 'Select realistic browser User-Agent strings and compute jitter delays to avoid traffic fingerprinting during web research.',
    language: 'python',
    usageCount: 0,
    created: Date.now() - 1000 * 60 * 15,
    lastUsed: null,
    successRate: 1.0,
    gapAnalysis: 'OPSEC: footprint obfuscation against IP bans / cadence detection',
    source: 'seed',
    version: '1.0.0',
  },
  {
    name: 'google_dorker',
    description: 'OSINT skill: constructs advanced Google dork queries (filetype, site, intitle, inurl, cache) to find publicly exposed data that appears private — user data, config files, credentials, directories.',
    language: 'python',
    usageCount: 0,
    created: Date.now() - 1000 * 60 * 10,
    lastUsed: null,
    successRate: 1.0,
    gapAnalysis: 'OPSEC/OSINT: surface freely-public information that seems private using dork techniques',
    source: 'seed',
    version: '1.0.0',
  },
]

/** 3 DEMO plugins specifically for testing latest arXiv papers for ideas. */
const DEMO_ARXIV_PLUGINS: Record<string, string> = {
  arxiv_fetcher: `#!/usr/bin/env python3
"""Fetch latest arXiv papers for a research topic."""
import sys, urllib.request, json, re

def fetch_arxiv(topic, max_results=10):
    query = f'all:{topic}'
    url = f"http://export.arxiv.org/api/query?search_query={query}&start=0&max_results={max_results}"
    with urllib.request.urlopen(url, timeout=30) as response:
        raw = response.read().decode('utf-8')
    titles = re.findall(r'<title>(.*?)</title>', raw, re.S)
    # Skip the feed title, keep paper titles
    return [t.strip() for t in titles[1:]]

def main():
    topic = sys.argv[1] if len(sys.argv) > 1 else "large language models"
    for t in fetch_arxiv(topic):
        print(f"- {t}")

if __name__ == "__main__":
    main()`,

  arxiv_summarizer: `#!/usr/bin/env python3
"""Summarize arXiv paper abstracts and extract key ideas."""
import sys, urllib.request, json, re

def fetch_arxiv(topic, max_results=10):
    query = f'all:{topic}'
    url = f"http://export.arxiv.org/api/query?search_query={query}&start=0&max_results={max_results}"
    with urllib.request.urlopen(url, timeout=30) as response:
        raw = response.read().decode('utf-8')
    # Extract abstracts from the XML feed
    abstracts = re.findall(r'<summary>(.*?)</summary>', raw, re.S)
    titles = re.findall(r'<title>(.*?)</title>', raw, re.S)
    links = re.findall(r'<id>(.*?)</id>', raw, re.S)
    return titles, abstracts, links

def summarize(title, abstract):
    # Strip XML tags and normalize whitespace
    abstract = re.sub(r'<[^>]+>', ' ', abstract)
    abstract = re.sub(r'\s+', ' ', abstract).strip()
    return f"{title}\n{abstract[:500]}"

def main():
    topic = sys.argv[1] if len(sys.argv) > 1 else "large language models"
    titles, abstracts, links = fetch_arxiv(topic)
    for i, (title, abstract, link) in enumerate(zip(titles, abstracts, links), 1):
        print(f"\n[{i}] {title}")
        print(f"URL: {link.strip()}")
        print(f"Summary: {summarize(title, abstract)[:500]}")

if __name__ == "__main__":
    main()`,

  arxiv_idea_explorer: `#!/usr/bin/env python3
"""Explore arXiv papers and extract research ideas from titles/abstracts."""
import sys, urllib.request, re

def fetch_arxiv(topic, max_results=20):
    query = f'all:{topic}'
    url = f"http://export.arxiv.org/api/query?search_query={query}&start=0&max_results={max_results}"
    with urllib.request.urlopen(url, timeout=30) as response:
        raw = response.read().decode('utf-8')
    titles = re.findall(r'<title>(.*?)</title>', raw, re.S)
    abstracts = re.findall(r'<summary>(.*?)</summary>', raw, re.S)
    links = re.findall(r'<id>(.*?)</id>', raw, re.S)
    return titles, abstracts, links

def extract_ideas(title, abstract):
    # Simple keyword-based idea extraction
    abstract = re.sub(r'<[^>]+>', ' ', abstract)
    abstract = re.sub(r'\s+', ' ', abstract).strip()
    keywords = re.findall(r'\b[a-zA-Z]{4,}\b', abstract)
    # Count frequency of meaningful words
    counts = {}
    for w in keywords:
        counts[w] = counts.get(w, 0) + 1
    top = sorted(counts.items(), key=lambda x: x[1], reverse=True)[:10]
    return [f"- {w} ({count}x)" for w, count in top]

def main():
    topic = sys.argv[1] if len(sys.argv) > 1 else "large language models"
    titles, abstracts, links = fetch_arxiv(topic)
    for i, (title, abstract, link) in enumerate(zip(titles, abstracts, links), 1):
        print(f"\n[{i}] {title}")
        print(f"URL: {link.strip()}")
        print("Keywords: " + "; ".join(extract_ideas(title, abstract)))

if __name__ == "__main__":
    main()`,
}

/** Write the seed .py files for the core tools if they don't exist. */
function ensureSeedScripts() {
  if (!existsSync(PLUGIN_DIR)) mkdirSync(PLUGIN_DIR, { recursive: true })
  for (const [name, code] of Object.entries(DEMO_ARXIV_PLUGINS)) {
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
    // Add demo arxiv plugins
    for (const name of Object.keys(DEMO_ARXIV_PLUGINS)) {
      initial[name] = {
        name,
        description: `Demo plugin for arXiv research ideas: ${name}`,
        language: 'python',
        usageCount: 0,
        created: Date.now(),
        lastUsed: null,
        successRate: 1.0,
        source: 'demo',
        version: '1.0.0',
      }
    }
    writeFileSync(REGISTRY_PATH, JSON.stringify(initial, null, 2), 'utf-8')
    console.log(`[registry] seeded ${Object.keys(initial).length} tools → ${REGISTRY_PATH}`)
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
            source: 'auto',
            version: '1.0.0',
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
    source: 'agent',
    version: '1.0.0',
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
