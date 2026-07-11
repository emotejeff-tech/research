/**
 * Research Orchestrator Mini-Service
 * ---------------------------------
 * Multi-agent orchestration engine running a Plan → Discovery → Synthesis →
 * Generation → Critique (Actor-Critic) loop using z-ai-web-dev-sdk.
 *
 * Streams events over socket.io (path "/") to the Next.js frontend, which
 * connects via `io("/?XTransformPort=3003")`.
 *
 * Token-efficiency strategy (hybrid routing):
 *  - web_search (cheap) used heavily in Discovery.
 *  - LLM used for Planning, Synthesis, Plugin generation, and Critique.
 *  - Critique loop capped at MAX_ITERATIONS=3 to prevent token looping.
 */

import { createServer } from 'http'
import { Server } from 'socket.io'
import ZAI from 'z-ai-web-dev-sdk'

const PORT = 3003
const MAX_CRITIQUE_ITERATIONS = 3

// ---------- Types ----------
type Phase =
  | 'planning'
  | 'discovery'
  | 'synthesis'
  | 'generation'
  | 'critique'
  | 'final'

interface Source {
  id: string
  query: string
  title: string
  url: string
  snippet: string
  host: string
}

interface Plugin {
  id: string
  name: string
  description: string
  language: string
  code: string
  createdAt: number
}

interface CritiqueRound {
  iteration: number
  verdict: 'pass' | 'revise'
  issues: string[]
  notes: string
}

interface TaskState {
  id: string
  query: string
  status: 'running' | 'completed' | 'error'
  phase: Phase
  subQueries: string[]
  sources: Source[]
  draft: string
  plugin: Plugin | null
  critiqueRounds: CritiqueRound[]
  finalReport: string
  startedAt: number
  finishedAt: number | null
  error: string | null
}

// ---------- In-memory stores ----------
const tasks = new Map<string, TaskState>()
const pluginRegistry: Plugin[] = [
  {
    id: 'seed-1',
    name: 'arxiv_fetcher',
    description: 'Fetch and summarize the latest arXiv abstracts for a topic.',
    language: 'python',
    code: `import urllib.request, json, re

def fetch_arxiv(topic, max_results=5):
    url = f"http://export.arxiv.org/api/query?search_query=all:{topic}&max_results={max_results}"
    raw = urllib.request.urlopen(url, timeout=20).read().decode()
    titles = re.findall(r"<title>(.*?)</title>", raw, re.S)
    return titles[1:]  # skip feed title

if __name__ == "__main__":
    for t in fetch_arxiv("large language models"):
        print("-", t.strip())`,
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 2,
  },
  {
    id: 'seed-2',
    name: 'source_crossref',
    description: 'Cross-reference a claim against a list of source snippets.',
    language: 'python',
    code: `import re

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
    claim = "Renewable energy adoption reduces carbon emissions."
    srcs = ["Solar and wind lower CO2 output.", "Fossil fuels remain dominant."]
    for score, s in cross_reference(claim, srcs):
        print(f"{score:.2f}  {s}")`,
    createdAt: Date.now() - 1000 * 60 * 60 * 24,
  },
  {
    id: 'seed-3',
    name: 'pdf_outline',
    description: 'Extract a plain-text outline from a PDF URL using stdlib only.',
    language: 'python',
    code: `import urllib.request, re

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
    for h in outline("https://example.com/paper.pdf"):
        print("-", h)`,
    createdAt: Date.now() - 1000 * 60 * 30,
  },
]
const history: TaskState[] = [] // completed tasks (most recent first)

// ---------- SDK ----------
let zai: any = null
async function getZAI() {
  if (!zai) zai = await ZAI.create()
  return zai
}

// ---------- Utilities ----------
const uid = () => Math.random().toString(36).slice(2, 10)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Robust JSON extraction from LLM output (handles ```json fences). */
function extractJSON<T = any>(text: string): T | null {
  if (!text) return null
  // strip code fences
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fence ? fence[1] : text
  // find first { ... } or [ ... ]
  const start = candidate.search(/[\[{]/)
  if (start === -1) return null
  // try progressively smaller slices
  for (let end = candidate.length; end > start; end--) {
    const slice = candidate.slice(start, end)
    try {
      return JSON.parse(slice) as T
    } catch {
      /* continue */
    }
  }
  return null
}

/** LLM chat helper with retry + graceful degradation. */
async function llm(
  systemPrompt: string,
  userPrompt: string,
  retries = 2,
): Promise<string> {
  let lastErr: any
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const sdk = await getZAI()
      const completion = await sdk.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        thinking: { type: 'disabled' },
      })
      const content = completion?.choices?.[0]?.message?.content
      if (content && content.trim().length > 0) return content.trim()
      throw new Error('Empty LLM response')
    } catch (e) {
      lastErr = e
      console.error(`[llm] attempt ${attempt + 1} failed:`, (e as Error)?.message)
      if (attempt < retries) await sleep(800 * (attempt + 1))
    }
  }
  throw lastErr
}

// ---------- Emit helper bound to a socket ----------
function makeEmitter(socket: any, taskId: string) {
  return (event: string, payload: any) => {
    socket.emit(event, { taskId, ...payload })
  }
}

// ============================================================
//  ORCHESTRATION
// ============================================================

async function runResearch(socket: any, query: string) {
  const taskId = uid()
  const emit = makeEmitter(socket, taskId)

  const task: TaskState = {
    id: taskId,
    query,
    status: 'running',
    phase: 'planning',
    subQueries: [],
    sources: [],
    draft: '',
    plugin: null,
    critiqueRounds: [],
    finalReport: '',
    startedAt: Date.now(),
    finishedAt: null,
    error: null,
  }
  tasks.set(taskId, task)

  try {
    // -------- PHASE 1: PLANNING (Coordinator) --------
    task.phase = 'planning'
    emit('research:phase', { phase: 'planning', title: 'Coordinator: Decomposing query' })
    emit('research:thought', {
      agent: 'Coordinator',
      text: `Breaking down the research goal: "${query}" into a focused execution graph.`,
    })
    await sleep(500)

    const planJSON = await llm(
      'You are the Coordinator agent in a multi-agent research system. Decompose the user research goal into 3 precise web search sub-queries that, when answered, enable a thorough synthesis. Return ONLY valid JSON: {"subqueries": ["q1","q2","q3"]}.',
      `Research goal: ${query}`,
    )
    const plan = extractJSON<{ subqueries?: string[] }>(planJSON)
    task.subQueries = (plan?.subqueries || []).slice(0, 3)
    if (task.subQueries.length === 0) task.subQueries = [query]
    emit('research:thought', {
      agent: 'Coordinator',
      text: `Execution graph ready with ${task.subQueries.length} discovery branches.`,
      meta: { subqueries: task.subQueries },
    })
    await sleep(400)

    // -------- PHASE 2: DISCOVERY (Search Agent) --------
    task.phase = 'discovery'
    emit('research:phase', { phase: 'discovery', title: 'Discovery Agent: Deep web search' })
    const sdk = await getZAI()
    for (const sq of task.subQueries) {
      emit('research:thought', {
        agent: 'Discovery',
        text: `Searching the web: "${sq}"`,
      })
      try {
        const results: any[] = await sdk.functions.invoke('web_search', {
          query: sq,
          num: 5,
        })
        for (const r of results.slice(0, 4)) {
          const src: Source = {
            id: uid(),
            query: sq,
            title: r.name || r.title || 'Untitled',
            url: r.url,
            snippet: (r.snippet || '').slice(0, 280),
            host: r.host_name || '',
          }
          task.sources.push(src)
          emit('research:source', { source: src })
          await sleep(120)
        }
      } catch (e) {
        emit('research:thought', {
          agent: 'Discovery',
          text: `Search failed for "${sq}", continuing with partial results. (${(e as Error).message})`,
        })
      }
      await sleep(200)
    }
    emit('research:thought', {
      agent: 'Discovery',
      text: `Collected ${task.sources.length} sources across ${task.subQueries.length} branches.`,
    })
    await sleep(400)

    // -------- ACTOR-CRITIC LOOP --------
    // Synthesis (Actor) -> Critique (Critic) -> revise if needed (max 3 iters)
    let iteration = 0
    let lastFeedback = ''

    while (iteration < MAX_CRITIQUE_ITERATIONS) {
      iteration += 1

      // ---- PHASE 3: SYNTHESIS (Actor) ----
      task.phase = 'synthesis'
      emit('research:phase', {
        phase: 'synthesis',
        title: `Synthesis Agent: drafting report (iteration ${iteration})`,
      })
      emit('research:iteration', { iteration, role: 'actor' })

      const sourcesBlock = task.sources
        .map(
          (s, i) =>
            `[${i + 1}] ${s.title}\n    URL: ${s.url}\n    ${s.snippet}`,
        )
        .join('\n')

      const synthPrompt = lastFeedback
        ? `Previous draft was critiqued. Feedback to address: ${lastFeedback}\n\nRevise the research synthesis accordingly.`
        : 'Produce the first synthesis.'

      const draft = await llm(
      `You are the Synthesis (Actor) agent. Given the research goal and gathered sources, write a focused, well-structured synthesis in Markdown. Cite sources inline as [n]. Address critic feedback when provided. Keep it under ~450 words.`,
        `Research goal: ${query}\n\nSources:\n${sourcesBlock}\n\n${synthPrompt}`,
      )
      task.draft = draft
      emit('research:thought', {
        agent: 'Synthesis',
        text: `Draft ${iteration} produced (${draft.length} chars).`,
      })
      await sleep(300)

      // ---- PHASE 5: CRITIQUE (Critic) ----
      task.phase = 'critique'
      emit('research:phase', {
        phase: 'critique',
        title: `Critic Agent: verifying (iteration ${iteration})`,
      })
      emit('research:iteration', { iteration, role: 'critic' })

      const critiqueRaw = await llm(
      `You are the Critic agent in an Actor-Critic research system. Your ONLY job is to find flaws, logical fallacies, missing edge cases, unsupported claims, or source-misattribution in the Actor's synthesis. Be rigorous but fair. Return ONLY JSON: {"verdict":"pass"|"revise","issues":["..."],"notes":"..."}. Use "pass" only if the synthesis is accurate, well-cited, and complete.`,
        `Research goal: ${query}\n\nActor's synthesis (iteration ${iteration}):\n${draft}\n\nSources provided:\n${sourcesBlock}`,
      )
      const critique = extractJSON<CritiqueRound>(critiqueRaw) || {
        iteration,
        verdict: 'pass' as const,
        issues: [],
        notes: 'Critic returned unparseable output; defaulting to pass.',
      }
      const round: CritiqueRound = { iteration, ...critique }
      task.critiqueRounds.push(round)
      emit('research:critique', { round })

      if (round.verdict === 'pass') {
        emit('research:thought', {
          agent: 'Critic',
          text: `Iteration ${iteration}: PASSED. ${round.notes || 'No blocking issues.'}`,
        })
        break
      } else {
        lastFeedback = round.issues
          .map((i) => `- ${i}`)
          .join('; ')
        emit('research:thought', {
          agent: 'Critic',
          text: `Iteration ${iteration}: REVISE. ${round.issues.length} issue(s) found. Looping back to Synthesis.`,
        })
        await sleep(400)
      }
    }

    // -------- PHASE 4: GENERATION (Plugin / Self-Teaching) --------
    task.phase = 'generation'
    emit('research:phase', {
      phase: 'generation',
      title: 'Evolution Agent: generating a reusable plugin',
    })
    emit('research:thought', {
      agent: 'Evolution',
      text: 'Designing a self-contained Python utility to automate part of this research workflow for future runs.',
    })

    const pluginRaw = await llm(
    `You are the Evolution agent. Based on the research domain, design a small, self-contained Python utility that would genuinely help automate or extend this kind of research (e.g. a fetcher, parser, analyzer, or validator). It must be runnable, under ~40 lines, and use only the standard library. Return ONLY JSON: {"name":"snake_case_name","description":"one line","language":"python","code":"..."}.`,
      `Research goal: ${query}\nDomain hints: ${task.subQueries.join(', ')}\n\nReturn the plugin JSON.`,
    )
    const pluginParsed = extractJSON<Omit<Plugin, 'id' | 'createdAt'>>(pluginRaw)
    if (pluginParsed && pluginParsed.name && pluginParsed.code) {
      const plugin: Plugin = {
        id: uid(),
        name: pluginParsed.name,
        description: pluginParsed.description || '',
        language: pluginParsed.language || 'python',
        code: pluginParsed.code,
        createdAt: Date.now(),
      }
      task.plugin = plugin
      pluginRegistry.unshift(plugin)
      emit('research:plugin', { plugin })
      emit('research:thought', {
        agent: 'Evolution',
        text: `Plugin "${plugin.name}" saved to custom_plugins/ registry.`,
      })
    } else {
      emit('research:thought', {
        agent: 'Evolution',
        text: 'Plugin generation returned unparseable output; skipping registry save.',
      })
    }
    await sleep(400)

    // -------- PHASE 6: FINAL --------
    task.phase = 'final'
    task.status = 'completed'
    task.finalReport = task.draft
    task.finishedAt = Date.now()
    emit('research:phase', { phase: 'final', title: 'Research complete' })
    emit('research:final', {
      query: task.query,
      finalReport: task.finalReport,
      sources: task.sources,
      plugin: task.plugin,
      critiqueRounds: task.critiqueRounds,
      iterations: task.critiqueRounds.length,
      durationMs: task.finishedAt - task.startedAt,
    })

    // archive
    history.unshift(task)
    if (history.length > 12) history.pop()
  } catch (err) {
    task.status = 'error'
    task.error = (err as Error)?.message || String(err)
    task.finishedAt = Date.now()
    emit('research:error', { message: task.error, phase: task.phase })
  }
}

// ============================================================
//  SOCKET SERVER
// ============================================================

const httpServer = createServer((_req, res) => {
  // tiny health endpoint
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ ok: true, service: 'research-orchestrator' }))
})

const io = new Server(httpServer, {
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
})

io.on('connection', (socket) => {
  console.log(`[orchestrator] client connected: ${socket.id}`)

  socket.on('research:start', (data: { query: string }) => {
    const query = (data?.query || '').trim()
    if (!query) {
      socket.emit('research:error', { message: 'Empty query' })
      return
    }
    // run asynchronously, streaming events back to this socket
    runResearch(socket, query).catch((e) => {
      socket.emit('research:error', {
        message: (e as Error)?.message || 'orchestration crashed',
      })
    })
  })

  socket.on('plugins:request', () => {
    socket.emit('plugins:list', { plugins: pluginRegistry })
  })

  socket.on('history:request', () => {
    socket.emit('history:list', {
      history: history.map((t) => ({
        id: t.id,
        query: t.query,
        status: t.status,
        iterations: t.critiqueRounds.length,
        sources: t.sources.length,
        finalReport: t.finalReport.slice(0, 200),
        startedAt: t.startedAt,
        finishedAt: t.finishedAt,
      })),
    })
  })

  socket.on('disconnect', () => {
    console.log(`[orchestrator] client disconnected: ${socket.id}`)
  })
})

httpServer.listen(PORT, () => {
  console.log(`[research-orchestrator] socket.io listening on :${PORT}`)
})

process.on('SIGTERM', () => httpServer.close(() => process.exit(0)))
process.on('SIGINT', () => httpServer.close(() => process.exit(0)))
