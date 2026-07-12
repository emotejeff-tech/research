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
  {
    name: 'opsec_log_scrubber',
    description: 'Scrub environment variables, local filesystem signatures, and API tokens out of log streams before external transmission.',
    language: 'python',
    usageCount: 0,
    created: Date.now() - 1000 * 60 * 20,
    lastUsed: null,
    successRate: 1.0,
    gapAnalysis: 'OPSEC: prevent credential/path leakage in research outputs',
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
    opsec_log_scrubber: `import re, sys

def sanitize_stream(raw_text):
    """OPSEC: detect and mask high-exposure data patterns."""
    count = 0
    # API keys: OpenAI, GitHub, Google, Anthropic, HuggingFace
    key_pattern = r'(sk-[a-zA-Z0-9]{32,}|ghp_[a-zA-Z0-9]{36}|AIzaSy[a-zA-Z0-9-_]{33}|sk-ant-[a-zA-Z0-9-_]+|hf_[a-zA-Z0-9]{30,})'
    raw_text, n = re.subn(key_pattern, "[REDACTED_CREDENTIAL]", raw_text)
    count += n
    # Bearer tokens
    raw_text, n = re.subn(r'(Bearer\\s+[a-zA-Z0-9._-]{20,})', "Bearer [REDACTED]", raw_text)
    count += n
    # Linux absolute paths
    raw_text, n = re.subn(r'/home/[a-zA-Z0-9_-]+', '/home/[REDACTED_USER]', raw_text)
    count += n
    raw_text, n = re.subn(r'/Users/[a-zA-Z0-9_-]+', '/Users/[REDACTED_USER]', raw_text)
    count += n
    # Windows paths
    raw_text, n = re.subn(r'C:\\\\\\\\Users\\\\[a-zA-Z0-9_-]+', r'C:\\\\Users\\\\[REDACTED_USER]', raw_text)
    count += n
    # Email addresses
    raw_text, n = re.subn(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}', "[REDACTED_EMAIL]", raw_text)
    count += n
    # IP addresses (private ranges)
    raw_text, n = re.subn(r'\\b(?:10|172|192)\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\b', "[REDACTED_IP]", raw_text)
    count += n
    return raw_text, count

if __name__ == "__main__":
    text = sys.argv[1] if len(sys.argv) > 1 else "test sk-1234567890abcdefghijklmnop123456 /home/user/secret"
    cleaned, n = sanitize_stream(text)
    print(f"[OPSEC] scrubbed {n} item(s)")
    print(cleaned)`,
    ua_rotator: `import random, sys

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1",
]

def rotate_ua():
    return random.choice(USER_AGENTS)

def jitter_delay():
    return random.randint(100, 1500)

if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "ua"
    if mode == "jitter":
        print(jitter_delay())
    else:
        print(rotate_ua())`,
    google_dorker: `import sys, json

# OSINT dork templates — find publicly exposed data that appears private
DORK_TEMPLATES = {
    "exposed_files": [
        'site:{domain} filetype:pdf',
        'site:{domain} filetype:xls OR filetype:xlsx',
        'site:{domain} filetype:doc OR filetype:docx',
        'site:{domain} filetype:sql OR filetype:db OR filetype:csv',
        'site:{domain} filetype:env OR filetype:config OR filetype:ini',
    ],
    "credentials": [
        'site:{domain} "password" OR "passwd" OR "credentials"',
        'site:{domain} "api key" OR "apikey" OR "secret_key"',
        'site:{domain} "BEGIN RSA PRIVATE KEY"',
        'site:{domain} "authorization: bearer"',
        'intext:"index of" "parent directory" filetype:env',
    ],
    "user_data": [
        'site:{domain} intext:"email" OR intext:"phone" OR intext:"address"',
        'site:{domain} intitle:"index of" "backup"',
        'site:{domain} inurl:admin OR inurl:login OR inurl:dashboard',
        'site:{domain} inurl:wp-content/uploads/',
        'site:{domain} intext:"ssn" OR intext:"social security"',
    ],
    "exposed_dirs": [
        'site:{domain} intitle:"index of" /',
        'site:{domain} intitle:"index of /backup"',
        'site:{domain} intitle:"index of /admin"',
        'site:{domain} inurl:/uploads/ OR inurl:/files/',
        'site:{domain} intext:"directory listing"',
    ],
    "cached_versions": [
        'cache:{domain}',
        'site:{domain} inurl:wp-config.php',
        'site:{domain} inurl:.git OR inurl:.svn',
        'site:{domain} inurl:phpinfo.php',
        'site:{domain} inurl:server-status',
    ],
}

def build_dorks(query):
    \"\"\"Build OSINT dork queries from a search term.\"\"\"
    # Extract domain-like terms from the query
    words = query.replace('http://', '').replace('https://', '').split()
    domain = ''
    for w in words:
        if '.' in w and ' ' not in w:
            domain = w.rstrip('/')
            break
    if not domain:
        domain = words[0] if words else 'example.com'

    dorks = []
    for category, templates in DORK_TEMPLATES.items():
        for t in templates[:2]:  # 2 per category
            dorks.append({
                'category': category,
                'dork': t.format(domain=domain),
                'description': f'OSINT: {category} — finds publicly exposed {category.replace("_", " ")} for {domain}'
            })
    return dorks

if __name__ == "__main__":
    query = sys.argv[1] if len(sys.argv) > 1 else "example.com security"
    dorks = build_dorks(query)
    print(f"[OSINT] Generated {len(dorks)} dork queries for intelligence gathering")
    for d in dorks:
        print(f"\\n[{d['category'].upper()}] {d['dork']}")
    print("\\n---\\nThese dorks find freely-public information that may appear private.")
    print("Use responsibly. Only search domains/data you own or have permission to investigate.")`,
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
