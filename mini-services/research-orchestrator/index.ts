/**
 * Research Orchestrator — main server (Step 1: FastAPI-equivalent entrypoint).
 * -----------------------------------------------------------------------
 * Socket.io server (path "/") running the multi-agent execution graph:
 *   Plan → Discover → (Synthesize ↔ Critic)* → Evolve → Final
 *
 * The agent logic lives in `agents/` and the capabilities in `tools/`,
 * mirroring the blueprint's `backend/agents` + `backend/tools` layout.
 *
 * Step 4 — Local Fallback: if the primary LLM is exhausted (402 / credits /
 * rate-limit), the run degrades to a no-LLM snippet compilation instead of
 * freezing. A `research:routing` event tells the UI which mode is active.
 */

import { createServer } from 'http'
import { Server } from 'socket.io'
import type { Phase, TaskState, Plugin, Emit } from './types'
import { uid, sleep } from './util'
import { plan } from './agents/planner'
import { discover } from './agents/researcher'
import { synthesize } from './agents/synthesizer'
import { critique } from './agents/critic'
import { evolve } from './agents/evolution'

const PORT = 3003
const MAX_CRITIQUE_ITERATIONS = 3

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
const history: TaskState[] = []

// ---------- Emit helper ----------
function makeEmitter(socket: any, taskId: string): Emit {
  return (event, payload) => socket.emit(event, { taskId, ...payload })
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
    taskType: 'research',
    subQueries: [],
    sources: [],
    draft: '',
    plugin: null,
    critiqueRounds: [],
    finalReport: '',
    routingMode: 'primary',
    startedAt: Date.now(),
    finishedAt: null,
    error: null,
  }
  tasks.set(taskId, task)

  let degraded = false

  try {
    // -------- PHASE 1: PLANNING (Coordinator) --------
    task.phase = 'planning'
    emit('research:phase', { phase: 'planning', title: 'Coordinator: Decomposing query' })
    emit('research:thought', {
      agent: 'Coordinator',
      text: `Breaking down the research goal: "${query}" into a focused execution graph.`,
    })
    await sleep(500)

    try {
      const planResult = await plan(query)
      task.subQueries = planResult.subqueries
      task.taskType = planResult.taskType
      emit('research:taskType', { taskType: task.taskType })
      emit('research:thought', {
        agent: 'Coordinator',
        text:
          task.taskType === 'blueprint'
            ? `Classified as a BLUEPRINT goal — agents will produce the best actionable design using latest research.`
            : `Classified as a RESEARCH goal — agents will form an independent, evidence-based conclusion.`,
      })
    } catch (e) {
      // Planner LLM unavailable — degrade early, keep discovery working.
      degraded = true
      task.routingMode = 'degraded'
      task.subQueries = [query]
      emit('research:routing', {
        mode: 'degraded',
        reason: `planner LLM unavailable (${(e as Error).message}); using raw query`,
      })
      emit('research:thought', {
        agent: 'Router',
        text: 'Primary LLM unavailable for planning — degrading to single-query discovery. Search will still run.',
      })
    }
    emit('research:thought', {
      agent: 'Coordinator',
      text: `Execution graph ready with ${task.subQueries.length} discovery branches.`,
      meta: { subqueries: task.subQueries },
    })
    await sleep(400)

    // -------- PHASE 2: DISCOVERY (Search Agent) --------
    task.phase = 'discovery'
    emit('research:phase', { phase: 'discovery', title: 'Discovery Agent: Deep web search' })
    task.sources = await discover(task.subQueries, emit)
    await sleep(400)

    // -------- ACTOR-CRITIC LOOP --------
    let iteration = 0
    let lastFeedback = ''

    if (!degraded) {
      while (iteration < MAX_CRITIQUE_ITERATIONS) {
        iteration += 1

        // ---- PHASE 3: SYNTHESIS (Actor, with fallback pipeline) ----
        task.phase = 'synthesis'
        emit('research:phase', {
          phase: 'synthesis',
          title: `Synthesis Agent: drafting report (iteration ${iteration})`,
        })
        emit('research:iteration', { iteration, role: 'actor' })

        const { draft, mode } = await synthesize(
          query,
          task.sources,
          lastFeedback,
          iteration,
          task.taskType,
        )

        if (mode === 'degraded') {
          degraded = true
          task.routingMode = 'degraded'
          task.draft = draft
          emit('research:routing', {
            mode: 'degraded',
            reason: 'synthesis LLM exhausted (402 / credits / rate-limit)',
          })
          emit('research:thought', {
            agent: 'Router',
            text: 'Synthesis LLM exhausted — switching to degraded snippet-compilation mode. The run will deliver a sourced report without LLM synthesis.',
          })
          emit('research:thought', {
            agent: 'Synthesis',
            text: `Degraded draft compiled from ${task.sources.length} sources (no LLM).`,
          })
          break // skip critic loop in degraded mode
        }

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

        let round
        try {
          round = await critique(query, draft, task.sources, iteration, task.taskType)
        } catch (e) {
          // Critic LLM unavailable — accept the draft, mark degraded.
          degraded = true
          task.routingMode = 'degraded'
          emit('research:routing', {
            mode: 'degraded',
            reason: `critic LLM unavailable (${(e as Error).message})`,
          })
          round = {
            iteration,
            verdict: 'pass' as const,
            issues: [],
            notes: 'Critic LLM unavailable; draft accepted without verification (degraded).',
          }
        }
        task.critiqueRounds.push(round)
        emit('research:critique', { round })

        if (round.verdict === 'pass') {
          emit('research:thought', {
            agent: 'Critic',
            text: `Iteration ${iteration}: PASSED. ${round.notes || 'No blocking issues.'}`,
          })
          break
        } else {
          lastFeedback = round.issues.map((i) => `- ${i}`).join('; ')
          emit('research:thought', {
            agent: 'Critic',
            text: `Iteration ${iteration}: REVISE. ${round.issues.length} issue(s) found. Looping back to Synthesis.`,
          })
          await sleep(400)
        }
      }
    } else {
      // Already degraded at planning — compile a degraded synthesis now.
      task.phase = 'synthesis'
      emit('research:phase', {
        phase: 'synthesis',
        title: 'Synthesis Agent: degraded compilation',
      })
      emit('research:iteration', { iteration: 1, role: 'actor' })
      const result = await synthesize(query, task.sources, '', 1, task.taskType)
      task.draft = result.draft
      emit('research:thought', {
        agent: 'Synthesis',
        text: `Degraded draft compiled from ${task.sources.length} sources.`,
      })
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

    try {
      const plugin = await evolve(query, task.subQueries)
      if (plugin) {
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
    } catch (e) {
      emit('research:thought', {
        agent: 'Evolution',
        text: `Plugin generation skipped (LLM unavailable): ${(e as Error).message}`,
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
      iterations: degraded ? task.critiqueRounds.length || 1 : task.critiqueRounds.length,
      durationMs: task.finishedAt - task.startedAt,
      routingMode: task.routingMode,
      degraded,
      taskType: task.taskType,
    })

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
        routingMode: t.routingMode,
        taskType: t.taskType,
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
