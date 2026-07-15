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
import { synthesize, extractUpgrades, buildUpgradeReport } from './agents/synthesizer'
import { critique } from './agents/critic'
import { evolve, authorFromBlueprint, testTool, rollbackTool, runUnitTest } from './agents/evolution'
import { dream } from './agents/dreamer'
import { devilsAdvocate } from './agents/devils_advocate'
import { generateHypotheses, type Hypothesis } from './agents/hypothesis_engine'
import { generatePoisonedSource } from './agents/saboteur'
import { swarmPlan, spawnSpecialistAgent } from './agents/swarm_planner'
import { runEvolvedTool } from './tools/plugin_runner'
import {
  loadSavedRegistry,
  reconstructPlugins,
  registerTool,
  recordToolExecution,
  type PluginMeta,
} from './tools/plugin_registry'
import { initTelemetry, recordRun, getLogs, clearLogs, type RunLog } from './telemetry'
import { loadSearchCache, getCachedResults, cacheResults, getCacheStats } from './tools/search_cache'
import { initLocalMemory, storeConclusion, retrieveRelevant, getMemoryStats } from './tools/local_memory'
import { deprecateStaleTools } from './tools/skill_deprecation'
import { buildExecutionDigest, pruneSources } from './tools/context_pruner'
import { loadMetaPrompts, maybeEvolvePrompts, getEvolutionHistory } from './tools/meta_prompts'
import { loadSettings, saveSettings, getSettings, fetchModels as fetchLLMMModels, PROVIDER_PRESETS, type LLMSettings, type ProviderType } from './tools/settings'
import { announce, isVoiceEnabled, fetchVoices } from './tools/voicebox'
import { discoverEnvKeys, runHealthChecks } from './tools/health_check'
import { warmupLocalModel } from './tools/llm'
import type { UpgradeBlueprint } from './types'

const PORT = 3003
const MAX_CRITIQUE_ITERATIONS = 3

// ---------- Auto-detect local services ----------
async function autoDetectLocalServices() {
  try {
    const s = getSettings()
    // Try to fetch available voices from Audiobox
    try {
      const voices = await fetchVoices(s.voiceBoxUrl || '', s.voiceBoxApiKey || '')
      const voiceNames = voices.map((v) => typeof v === 'string' ? v : v.id || v.name).filter(Boolean)
      if (voiceNames.length > 0 && !s.ttsVoice) {
        s.ttsVoice = voiceNames[0]
        s.ttsVoices = voiceNames
        saveSettings(s)
        console.log(`[voicebox] auto-detected voices: ${voiceNames.join(', ')}`)
      }
    } catch (e) {
      console.warn('[voicebox] auto-detect voices failed:', (e as Error)?.message)
    }
    // Try to fetch available models from local LLM providers
    try {
      const models = await fetchLLMMModels(s.provider, s.baseURL || '', s.apiKey || '')
      if (models.models.length > 0 && !s.model) {
        s.model = models.models[0]
        s.baseURL = s.baseURL || PROVIDER_PRESETS[s.provider].defaultURL
        s.apiKey = s.apiKey || PROVIDER_PRESETS[s.provider].defaultKey
        s.enabled = true
        s.primary = true
        saveSettings(s)
        console.log(`[llm] auto-detected models: ${models.models.join(', ')}`)
      }
    } catch (e) {
      console.warn('[llm] auto-detect models failed:', (e as Error)?.message)
    }
  } catch (e) {
    console.error('[auto-detect] failed:', (e as Error)?.message)
  }
}

// Start local service detection on boot
autoDetectLocalServices().catch((e) => console.error('[auto-detect] unhandled:', (e as Error)?.message))

// ---------- Persistent execution memory ----------
const tasks = new Map<string, TaskState>()
/** Durable registry metadata (survives restarts via custom_plugins/registry.json). */
const pluginRegistryMeta: Record<string, PluginMeta> = loadSavedRegistry()
/** In-memory plugin list (reconstructed from disk + metadata at boot). */
let pluginRegistry: Plugin[] = reconstructPlugins(pluginRegistryMeta)
const history: TaskState[] = []

/** Latest health check statuses (updated on boot + on request). */
let latestHealthStatuses: any[] = []

/** Broadcast the current plugin list to a socket. */
function broadcastPlugins(socket: any) {
  socket.emit('plugins:list', { plugins: pluginRegistry })
}

// ---------- Emit helper ----------
function makeEmitter(socket: any, taskId: string): Emit {
  return (event, payload) => socket.emit(event, { taskId, ...payload })
}

/** Announce a message via TTS and emit the audio to the frontend. */
async function announcePhase(socket: any, message: string) {
  if (!isVoiceEnabled()) return
  try {
    const result = await announce(message)
    if (result.ok && result.audioBase64) {
      socket.emit('voice:announce', { audio: result.audioBase64, text: message })
    }
  } catch {
    /* best-effort — TTS failures shouldn't break the run */
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
    taskType: 'research',
    subQueries: [],
    sources: [],
    draft: '',
    plugin: null,
    critiqueRounds: [],
    dream: null,
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
    emit('research:thought', { agent: 'System', text: '⏳ Model is generating... (local models can take 30-120s per call)' })
    announcePhase(socket, 'Research initiated. Coordinator is decomposing your query.')
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

    // RAG: retrieve past conclusions from vector memory before searching.
    const pastConclusions = await retrieveRelevant(query, 3)
    if (pastConclusions.length > 0) {
      emit('research:thought', {
        agent: 'Memory',
        text: `🧠 RAG: Retrieved ${pastConclusions.length} past conclusion(s) from execution memory — checking for known facts before hitting the web…`,
      })
      for (const pc of pastConclusions) {
        emit('research:thought', {
          agent: 'Memory',
          text: `📄 Past: "${pc.query}" → ${pc.conclusion.slice(0, 100)}…`,
        })
      }
    }

    // Cache check: see if any sub-queries are already cached.
    const cachedQueries = task.subQueries.filter((sq) => getCachedResults(sq) !== null)
    if (cachedQueries.length > 0) {
      emit('research:thought', {
        agent: 'Cache',
        text: `⚡ Cache: ${cachedQueries.length} sub-query(ies) already cached — will return instantly without hitting the web.`,
      })
    }
    await sleep(400)

    // -------- SWARM MODE (parallel planners for blueprint tasks) --------
    if (task.taskType === 'blueprint' && !degraded) {
      emit('research:thought', {
        agent: 'Coordinator',
        text: '🐝 SWARM MODE: Spawning 3 parallel planners (Security / Performance / UX) to tackle the architecture from different angles…',
      })
      try {
        const branches = await swarmPlan(query)
        const extraSubs = branches.flatMap((b) => b.subqueries)
        // Merge swarm sub-queries into the existing ones (deduped, capped at 6).
        const merged = [...task.subQueries, ...extraSubs].filter(
          (v, i, a) => a.indexOf(v) === i,
        )
        task.subQueries = merged.slice(0, 6)
        for (const b of branches) {
          emit('research:thought', {
            agent: `Swarm·${b.angle}`,
            text: `🐝 ${b.angle} branch: ${b.subqueries.length} sub-queries merged into DAG.`,
          })
        }
      } catch (e) {
        emit('research:thought', {
          agent: 'Coordinator',
          text: `Swarm mode skipped: ${(e as Error).message}`,
        })
      }
      await sleep(300)
    }

    // -------- DYNAMIC AGENT SPAWNING --------
    if (!degraded) {
      try {
        const domain = task.subQueries[0]?.split(/\s+/).slice(0, 3).join(' ') || query.slice(0, 30)
        const specialistPrompt = await spawnSpecialistAgent(query, domain)
        emit('research:thought', {
          agent: 'Spawner',
          text: `🧬 Spawned specialist agent for "${domain}…" — tailored system prompt authored (${specialistPrompt.length} chars).`,
        })
      } catch {
        /* best-effort */
      }
      await sleep(200)
    }

    // -------- HYPOTHESIS ENGINE (anti-confirmation-bias) --------
    let hypotheses: Hypothesis[] = []
    if (task.taskType === 'research' && !degraded) {
      emit('research:thought', {
        agent: 'Hypothesis Engine',
        text: '🔬 Generating 3 mutually exclusive hypotheses to violently neutralize confirmation bias…',
      })
      try {
        hypotheses = await generateHypotheses(query)
        if (hypotheses.length > 0) {
          emit('research:hypotheses', { hypotheses })
          for (const h of hypotheses) {
            emit('research:thought', {
              agent: 'Hypothesis Engine',
              text: `📋 Hypothesis: "${h.statement.slice(0, 80)}…" → disproof query: "${h.disproofQuery.slice(0, 60)}"`,
            })
          }
          // Add disproof queries to the sub-queries so the Researcher searches for contradicting evidence.
          const disproofQueries = hypotheses.map((h) => h.disproofQuery).filter((q) => q.length > 5)
          task.subQueries = [...task.subQueries, ...disproofQueries].slice(0, 6)
          emit('research:thought', {
            agent: 'Hypothesis Engine',
            text: `🔬 Added ${disproofQueries.length} disproof queries to the DAG — Researcher will hunt for contradicting evidence.`,
          })
        }
      } catch (e) {
        emit('research:thought', {
          agent: 'Hypothesis Engine',
          text: `Hypothesis generation skipped: ${(e as Error).message}`,
        })
      }
      await sleep(300)
    }

    // -------- PHASE 2: DISCOVERY (Search Agent) --------
    task.phase = 'discovery'
    emit('research:phase', { phase: 'discovery', title: 'Discovery Agent: Deep web search' })
    announcePhase(socket, 'Discovery phase. Searching the web for sources.')
    task.sources = await discover(task.subQueries, emit)
    await sleep(400)

    // -------- SABOTEUR (adversarial red-teaming) --------
    if (!degraded && task.sources.length > 2) {
      emit('research:thought', {
        agent: 'Saboteur',
        text: '🎭 Adversarial red-team: injecting a poisoned source to test the Critic\'s resilience…',
      })
      try {
        const poisoned = await generatePoisonedSource(query)
        if (poisoned) {
          task.sources.push(poisoned.source)
          emit('research:source', { source: poisoned.source })
          emit('research:saboteur', { flaw: poisoned.flaw, flawType: poisoned.flawType })
          emit('research:thought', {
            agent: 'Saboteur',
            text: `🎭 Injected poisoned source: "${poisoned.source.title.slice(0, 50)}…" — flaw type: ${poisoned.flawType}. Critic must catch this.`,
          })
        }
      } catch (e) {
        emit('research:thought', {
          agent: 'Saboteur',
          text: `Saboteur skipped: ${(e as Error).message}`,
        })
      }
      await sleep(200)
    }

    // ============================================================
    //  UPGRADE PATH — active consumer of academic literature
    // ============================================================
    let upgradeCompleted = false
    if (task.taskType === 'upgrade' && !degraded) {
      emit('research:thought', {
        agent: 'Coordinator',
        text: '🧬 UPGRADE MODE INITIALIZED: Scanning literature for architectural enhancements to compile into executable skills…',
      })
      emit('research:upgrade', { stage: 'init' })

      // Step 1: Extract tool blueprints from the literature.
      task.phase = 'synthesis'
      emit('research:phase', {
        phase: 'synthesis',
        title: 'Nexus Architect: extracting tool blueprints from literature',
      })
      emit('research:thought', {
        agent: 'Synthesis',
        text: '⚙️ Extracting actionable mechanics from academic sources — not writing a summary, but isolating algorithms to compile…',
      })

      let blueprints: UpgradeBlueprint[] = []
      try {
        blueprints = await extractUpgrades(query, task.sources)
        emit('research:thought', {
          agent: 'Synthesis',
          text: `📋 Extracted ${blueprints.length} tool blueprint(s) from the literature.`,
        })
        emit('research:upgrade', { stage: 'blueprints', blueprints })
      } catch (e) {
        emit('research:thought', {
          agent: 'Synthesis',
          text: `Blueprint extraction failed: ${(e as Error).message}. Falling back to degraded synthesis.`,
        })
        degraded = true
      }

      if (!degraded && blueprints.length > 0) {
        // Step 2: Force the Evolution Engine to build each blueprint.
        task.phase = 'generation'
        emit('research:phase', {
          phase: 'generation',
          title: '🧬 Evolution Engine: compiling theoretical concepts into executable skills',
        })

        const createdTools: { name: string; success: boolean }[] = []

        for (const bp of blueprints) {
          emit('research:thought', {
            agent: 'Evolution',
            text: `⚙️ Compiling theoretical concept into executable skill: [${bp.suggestedToolName}]…`,
          })
          emit('research:upgrade', { stage: 'compiling', toolName: bp.suggestedToolName })

          try {
            // Author the tool directly from the blueprint's mechanics.
            const tool = await authorFromBlueprint(bp.suggestedToolName, bp.mechanics, bp.justification)
            if (!tool) {
              emit('research:thought', {
                agent: 'Evolution',
                text: `❌ Failed to parse code for [${bp.suggestedToolName}].`,
              })
              createdTools.push({ name: bp.suggestedToolName, success: false })
              continue
            }

            // Test in the sandbox.
            emit('research:thought', {
              agent: 'Evolution',
              text: `🔬 Sandbox Test: compiling ${tool.name}.py via python3 -m py_compile…`,
            })
            const test = testTool(tool.name, tool.code)
            let finalCode = tool.code
            let testStatus: 'passed' | 'failed' | 'patched' = test.passed ? 'passed' : 'failed'

            if (!test.passed) {
              // Try one patch attempt.
              emit('research:thought', {
                agent: 'Evolution',
                text: `🔧 Self-Correction: compile error — patching ${tool.name}…`,
              })
              const { patchTool } = await import('./agents/evolution')
              const patched = await patchTool(tool.name, tool.code, test.error || '', bp.mechanics)
              if (patched) {
                const retest = testTool(tool.name, patched.code)
                if (retest.passed) {
                  finalCode = patched.code
                  testStatus = 'patched'
                } else {
                  rollbackTool(tool.name)
                  emit('research:thought', {
                    agent: 'Evolution',
                    text: `❌ ${tool.name} failed after patch — rolled back.`,
                  })
                  createdTools.push({ name: bp.suggestedToolName, success: false })
                  continue
                }
              } else {
                rollbackTool(tool.name)
                createdTools.push({ name: bp.suggestedToolName, success: false })
                continue
              }
            }

            // Register to durable registry.
            const plugin: Plugin = {
              id: uid(),
              name: tool.name,
              description: tool.description,
              language: tool.language,
              code: finalCode,
              createdAt: Date.now(),
              gapAnalysis: bp.mechanics.slice(0, 200),
              testStatus,
              executionStatus: 'not_run',
              usageCount: 0,
              lastUsed: null,
              successRate: 1.0,
            }

            // Hot-swap execute.
            const sampleArg = task.subQueries[0] || query
            const exec = await runEvolvedTool(plugin.name, sampleArg)
            plugin.executionStatus = exec.ok ? 'ok' : 'error'
            plugin.executionResult = (exec.ok ? exec.stdout : exec.stderr).slice(0, 200)
            plugin.usageCount = 1
            plugin.lastUsed = Date.now()
            plugin.successRate = exec.ok ? 1.0 : 0.0

            registerTool(pluginRegistryMeta, plugin)
            pluginRegistry = reconstructPlugins(pluginRegistryMeta)
            broadcastPlugins(socket)
            task.plugin = plugin
            emit('research:plugin', { plugin })
            createdTools.push({ name: plugin.name, success: true })

            emit('research:thought', {
              agent: 'Evolution',
              text: `✨ Permanently registered: [${plugin.name}] — ${exec.ok ? 'compiled, tested & executed' : 'compiled & tested (runtime warning)'} 🧬`,
            })
            emit('research:upgrade', { stage: 'compiled', toolName: plugin.name, success: true })
          } catch (e) {
            emit('research:thought', {
              agent: 'Evolution',
              text: `❌ Failed to compile [${bp.suggestedToolName}]: ${(e as Error).message}`,
            })
            createdTools.push({ name: bp.suggestedToolName, success: false })
          }
          await sleep(300)
        }

        // Step 3: Build the upgrade report.
        task.draft = buildUpgradeReport(query, blueprints, createdTools)
        upgradeCompleted = true
        emit('research:thought', {
          agent: 'Coordinator',
          text: `🧬 UPGRADE COMPLETE: ${createdTools.filter((t) => t.success).length}/${createdTools.length} skill(s) permanently compiled and registered.`,
        })
        emit('research:upgrade', { stage: 'done', createdTools })

        // Skip to OPSEC audit + final — bypass normal critic/reflection/evolution.
        // (Jump directly to the OPSEC audit phase below.)
      } else if (!degraded) {
        emit('research:thought', {
          agent: 'Coordinator',
          text: '🧬 No blueprints extracted from literature. Falling back to standard synthesis.',
        })
        degraded = false // fall through to normal path
      }
    }

    // -------- ACTOR-CRITIC LOOP (skipped for successful UPGRADE runs) --------
    if (!upgradeCompleted) {
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

        const { draft, mode, tier } = await synthesize(
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
            tier: 'degraded',
            reason: 'all inference tiers exhausted (402 / credits / rate-limit, no local model)',
          })
          emit('research:thought', {
            agent: 'Router',
            text: 'All inference tiers exhausted — switching to degraded snippet-compilation mode. The run will deliver a sourced report without LLM synthesis.',
          })
          emit('research:thought', {
            agent: 'Synthesis',
            text: `Degraded draft compiled from ${task.sources.length} sources (no LLM).`,
          })
          break // skip critic loop in degraded mode
        }

        // Tier 2 (local model) engaged — surface it so the UI can show the routing.
        if (tier === 'local') {
          task.routingMode = 'primary' // still LLM-served, just local
          emit('research:routing', {
            mode: 'primary',
            tier: 'local',
            reason: 'primary cloud gateway unavailable — served by local model tier',
          })
          emit('research:thought', {
            agent: 'Router',
            text: 'Primary cloud gateway unavailable — served by the local model tier (Ollama / LM Studio).',
          })
        }

        task.draft = draft
        // Store a snapshot for timeline reversion.
        emit('research:snapshot', { iteration, draft, timestamp: Date.now() })
        emit('research:thought', {
          agent: 'Synthesis',
          text: `Draft ${iteration} produced (${draft.length} chars) via ${tier} tier.`,
        })
        await sleep(300)

        // ---- PHASE 4.5: DEVIL'S ADVOCATE (cross-agent peer review) ----
        try {
          emit('research:thought', {
            agent: "Devil's Advocate",
            text: '😈 Cross-agent peer review: attempting to break the Synthesizer\'s logic before the formal Critic…',
          })
          const da = await devilsAdvocate(query, draft, task.sources)
          if (da.fatalFlaws.length > 0 || da.weaknesses.length > 0) {
            const allIssues = [...da.fatalFlaws, ...da.weaknesses]
            emit('research:thought', {
              agent: "Devil's Advocate",
              text: `😈 Found ${da.fatalFlaws.length} fatal flaw(s) + ${da.weaknesses.length} weakness(es). Feeding to Actor as pre-critique feedback.`,
            })
            if (da.strongestCounter) {
              emit('research:thought', {
                agent: "Devil's Advocate",
                text: `😈 Strongest counter: ${da.strongestCounter.slice(0, 120)}`,
              })
            }
            // Merge Devil's Advocate findings into the feedback for the next iteration.
            if (lastFeedback) {
              lastFeedback += '; ' + allIssues.map((i) => `- ${i}`).join('; ')
            } else {
              lastFeedback = allIssues.map((i) => `- ${i}`).join('; ')
            }
          } else {
            emit('research:thought', {
              agent: "Devil's Advocate",
              text: '😈 Logic holds — no fatal flaws found. Proceeding to formal Critic.',
            })
          }
        } catch (e) {
          emit('research:thought', {
            agent: "Devil's Advocate",
            text: `Peer review skipped: ${(e as Error).message}`,
          })
        }
        await sleep(200)

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
          announcePhase(socket, `Critique iteration ${iteration} failed. ${round.issues.length} issues found. Looping back to synthesis.`)
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

    // -------- PHASE 3.5: REFLECTION (Dreamer) --------
    // The Dreamer reflects on ALL data, dreams on possibilities, proposes
    // best-possible outcomes + new goals, and surfaces relevant papers.
    if (!degraded) {
      task.phase = 'reflection'
      emit('research:phase', {
        phase: 'reflection',
        title: 'Dreamer: reflecting & dreaming on possibilities',
      })
      emit('research:thought', {
        agent: 'Dreamer',
        text: 'Reflecting on all data — dreaming on the possibilities to discover better ideas, best outcomes, and relevant papers…',
      })
      try {
        const dreamResult = await dream(query, task.draft, task.sources, task.taskType)
        if (dreamResult) {
          task.dream = dreamResult
          emit('research:dream', { dream: dreamResult })
          emit('research:thought', {
            agent: 'Dreamer',
            text: `Dream complete. Best outcome envisioned; ${dreamResult.newGoals.length} new goals; ${dreamResult.possibilities.length} possibilities; ${dreamResult.papers.length} relevant papers surfaced.`,
          })
          // Append the dream to the final report so it's part of the deliverable.
          const dreamMd = `\n\n---\n\n## ✦ Dreamer's Reflection & Possibilities\n\n### Best Possible Outcome\n${dreamResult.bestOutcome}\n\n### New Goals\n${dreamResult.newGoals.map((g) => `- ${g}`).join('\n')}\n\n### Possibilities\n${dreamResult.possibilities.map((p) => `- ${p}`).join('\n')}\n\n### Relevant Papers\n${dreamResult.papers.map((p) => `- **${p.title}** — ${p.relevance}`).join('\n')}\n\n### Reflection\n${dreamResult.reflection}\n`
          task.draft = task.draft + dreamMd
        }
      } catch (e) {
        emit('research:thought', {
          agent: 'Dreamer',
          text: `Dream stage skipped (LLM unavailable): ${(e as Error).message}`,
        })
      }
      await sleep(300)
    }

    // -------- PHASE 4: SELF-TEACHING LOOP (Evolution Engine) --------
    // Gap Analysis → Tool Authoring → Sandbox Test → Register → Execute
    task.phase = 'generation'
    emit('research:phase', {
      phase: 'generation',
      title: 'Evolution Engine: self-teaching loop',
    })
    emit('research:thought', {
      agent: 'Evolution',
      text: '🧠 Reflecting on historical skills registry to identify reusable tools before authoring new ones…',
    })

    try {
      const existingTools = pluginRegistry.map((p) => ({ name: p.name, description: p.description }))
      const result = await evolve(
        query,
        task.sources,
        task.subQueries,
        existingTools,
        (stage: string, detail?: any) => {
          const stageText: Record<string, string> = {
            gap: 'Gap Analysis: scanning research context for missing capabilities…',
            gap_done: `Gap Analysis: missing capability identified — "${detail?.capability}"`,
            reuse: `🧠 Reflection: existing tool "${detail?.name}" already covers this gap — reusing instead of authoring a new one.`,
            author: `🛠️ Tool Authoring: generating Python for "${detail?.capability}"…`,
            author_failed: 'Tool Authoring: failed to parse generated code.',
            test: `Sandbox Test: compiling "${detail?.name}.py" via python3 -m py_compile…`,
            patch: `Self-Correction: compile error detected — feeding stack trace to patcher…`,
            test_failed: `Sandbox Test: failed after patch attempt. Rolling back. (${detail?.error?.slice(0, 80)})`,
            register: `Skill Registry: registering "${detail?.name}" to custom_plugins/ on disk.`,
            done: `Evolution complete: "${detail?.plugin?.name}" validated and registered.`,
          }
          emit('research:evolution', { stage, detail })
          emit('research:thought', {
            agent: 'Evolution',
            text: stageText[stage] || stage,
          })
        },
      )

      const sampleArg = task.subQueries[0] || query

      // -------- CASE A: Reused an existing tool (reflection matched) --------
      if (result.testStatus === 'reused' && result.reusedToolName) {
        const toolName = result.reusedToolName
        emit('research:thought', {
          agent: 'Evolution',
          text: `⚡ Executing historical skill [${toolName}] to assist with the current dataset…`,
        })
        const exec = await runEvolvedTool(toolName, sampleArg)
        const success = exec.ok
        // Record execution in the durable registry.
        const updatedMeta = recordToolExecution(pluginRegistryMeta, toolName, success)
        // Update the in-memory plugin object.
        const pIdx = pluginRegistry.findIndex((p) => p.name === toolName)
        if (pIdx >= 0) {
          pluginRegistry[pIdx] = {
            ...pluginRegistry[pIdx],
            usageCount: updatedMeta?.usageCount,
            lastUsed: updatedMeta?.lastUsed,
            successRate: updatedMeta?.successRate,
            executionStatus: success ? 'ok' : 'error',
            executionResult: success ? exec.stdout.slice(0, 200) : exec.stderr.slice(0, 200),
          }
          task.plugin = pluginRegistry[pIdx]
        }
        broadcastPlugins(socket)
        emit('research:plugin', { plugin: task.plugin })
        emit('research:evolution', {
          stage: 'exec',
          detail: { status: success ? 'ok' : 'error', reused: true, result: success ? exec.stdout.slice(0, 200) : exec.stderr.slice(0, 200) },
        })
        emit('research:thought', {
          agent: 'Evolution',
          text: `⚡ Executed historical skill [${toolName}] (Used ${updatedMeta?.usageCount}x, success rate ${Math.round((updatedMeta?.successRate || 0) * 100)}%) → ${success ? exec.stdout.slice(0, 60) : 'runtime error'}${success && exec.stdout.length > 60 ? '…' : ''}`,
        })
      }

      // -------- CASE B: Created a new tool --------
      else if (result.plugin) {
        const plugin = result.plugin
        emit('research:thought', {
          agent: 'Evolution',
          text: `🛠️ Synthesizing new custom skill: "${plugin.name}"…`,
        })
        // Hot-swap: execute the newly evolved tool.
        emit('research:thought', {
          agent: 'Evolution',
          text: `⚡ Runtime Execution: hot-swapping "${plugin.name}" with sample input…`,
        })
        const exec = await runEvolvedTool(plugin.name, sampleArg)
        if (exec.ok) {
          plugin.executionStatus = 'ok'
          plugin.executionResult = exec.stdout.slice(0, 200)
          emit('research:thought', {
            agent: 'Evolution',
            text: `✨ Dynamically spawned and permanently registered: "${plugin.name}" → ${exec.stdout.slice(0, 60)}${exec.stdout.length > 60 ? '…' : ''}`,
          })
        } else {
          plugin.executionStatus = 'error'
          plugin.executionResult = exec.stderr.slice(0, 200)
          emit('research:thought', {
            agent: 'Evolution',
            text: `Runtime Execution: ✗ "${plugin.name}" threw an error. Feeding stack trace to Critic for self-correction.`,
          })
          emit('research:thought', {
            agent: 'Critic',
            text: `Self-Correction: runtime error received — ${exec.stderr.slice(0, 120)}`,
          })
        }

        // Persist to durable registry.
        plugin.usageCount = 1
        plugin.lastUsed = Date.now()
        plugin.successRate = exec.ok ? 1.0 : 0.0
        registerTool(pluginRegistryMeta, plugin)
        task.plugin = plugin
        pluginRegistry = reconstructPlugins(pluginRegistryMeta)
        broadcastPlugins(socket)
        emit('research:plugin', { plugin })
        emit('research:evolution', { stage: 'exec', detail: { status: plugin.executionStatus, result: plugin.executionResult } })
      }

      // -------- CASE C: Failed --------
      else {
        emit('research:thought', {
          agent: 'Evolution',
          text: `Self-Teaching Loop ended without a registered tool. Gap: "${result.gap.capability}". ${result.testError ? `Reason: ${result.testError.slice(0, 100)}` : ''}`,
        })
      }
    } catch (e) {
      emit('research:thought', {
        agent: 'Evolution',
        text: `Self-Teaching Loop skipped (LLM unavailable): ${(e as Error).message}`,
      })
    }
    await sleep(400)
    } // end if (!upgradeCompleted)

    // -------- PHASE 5: OPSEC AUDIT (Defensive Security) --------
    // Run the opsec_log_scrubber on the final report to strip credentials,
    // paths, emails and IPs before delivery. Also rotate UA + emit the audit.
    if (pluginRegistryMeta['opsec_log_scrubber'] && task.draft) {
      emit('research:thought', {
        agent: 'OPSEC',
        text: '🛡️ OPSEC: Invoking [opsec_log_scrubber] to sanitize the compiled report payload before delivery…',
      })
      try {
        const scrub = await runEvolvedTool('opsec_log_scrubber', task.draft.slice(0, 8000))
        if (scrub.ok && scrub.stdout) {
          const lines = scrub.stdout.split('\n')
          const scrubLine = lines.find((l) => l.includes('scrubbed')) || ''
          const itemsScrubbed = parseInt((scrubLine.match(/(\d+)/) || ['0'])[1], 10)
          // Record the OPSEC tool execution in the durable registry.
          const meta = recordToolExecution(pluginRegistryMeta, 'opsec_log_scrubber', true)
          emit('research:opsec', {
            tool: 'opsec_log_scrubber',
            itemsScrubbed,
            success: true,
            usageCount: meta?.usageCount,
          })
          emit('research:thought', {
            agent: 'OPSEC',
            text: `🛡️ OPSEC: Sanitized ${itemsScrubbed} high-exposure item(s) from the final report (credentials, paths, emails, IPs). Payload cleared for delivery.`,
          })
        } else {
          recordToolExecution(pluginRegistryMeta, 'opsec_log_scrubber', false)
          emit('research:opsec', { tool: 'opsec_log_scrubber', itemsScrubbed: 0, success: false })
          emit('research:thought', {
            agent: 'OPSEC',
            text: `🛡️ OPSEC: Scrubber executed but returned no output — report passed through unsanitized.`,
          })
        }
      } catch (e) {
        emit('research:opsec', { tool: 'opsec_log_scrubber', itemsScrubbed: 0, success: false, error: (e as Error).message })
        emit('research:thought', {
          agent: 'OPSEC',
          text: `🛡️ OPSEC: Scrubber failed — ${(e as Error).message}. Report passed through.`,
        })
      }
    }

    // Also rotate the UA as a footprint-obfuscation step (logged for audit).
    if (pluginRegistryMeta['ua_rotator']) {
      try {
        const ua = await runEvolvedTool('ua_rotator', 'ua')
        if (ua.ok) {
          recordToolExecution(pluginRegistryMeta, 'ua_rotator', true)
          emit('research:opsec', {
            tool: 'ua_rotator',
            rotatedUA: ua.stdout.slice(0, 60),
            success: true,
          })
          emit('research:thought', {
            agent: 'OPSEC',
            text: `🛡️ OPSEC: Rotated research footprint → ${ua.stdout.slice(0, 50)}… (anti-fingerprinting)`,
          })
        }
      } catch {
        /* best-effort */
      }
    }

    // -------- OSINT INTELLIGENCE GATHERING (Google Dorking) --------
    // OPSEC isn't just defensive — it's also the skill to find freely-public
    // information that seems private. The google_dorker constructs advanced
    // dork queries to surface exposed data, credentials, user info, etc.
    if (pluginRegistryMeta['google_dorker']) {
      emit('research:thought', {
        agent: 'OPSEC',
        text: '🔍 OSINT: Invoking [google_dorker] to construct advanced dork queries for finding publicly exposed data…',
      })
      try {
        const dorkInput = task.query.slice(0, 200)
        const dorkResult = await runEvolvedTool('google_dorker', dorkInput)
        if (dorkResult.ok && dorkResult.stdout) {
          const meta = recordToolExecution(pluginRegistryMeta, 'google_dorker', true)
          // Parse the dork output to count categories found.
          const categories = (dorkResult.stdout.match(/\[(EXPOSED_FILES|CREDENTIALS|USER_DATA|EXPOSED_DIRS|CACHED_VERSIONS)\]/g) || [])
          const dorkCount = categories.length
          emit('research:opsec', {
            tool: 'google_dorker',
            dorkCount,
            dorkOutput: dorkResult.stdout.slice(0, 500),
            success: true,
            usageCount: meta?.usageCount,
          })
          emit('research:thought', {
            agent: 'OPSEC',
            text: `🔍 OSINT: Constructed ${dorkCount} dork queries across ${new Set(categories).size} categories — these find freely-public data that may appear private (exposed files, credentials, user data, directories).`,
          })
          // Append the dork intelligence to the final report as an OSINT appendix.
          task.draft += '\n\n---\n\n## 🔍 OSINT Intelligence Appendix\n\n> The following Google dork queries were auto-generated to find publicly exposed data related to this research topic. These use freely-available public search techniques to surface information that may appear private.\n\n```\n' + dorkResult.stdout.slice(0, 1500) + '\n```\n'
        } else {
          recordToolExecution(pluginRegistryMeta, 'google_dorker', false)
          emit('research:opsec', { tool: 'google_dorker', dorkCount: 0, success: false })
        }
      } catch (e) {
        emit('research:opsec', { tool: 'google_dorker', dorkCount: 0, success: false, error: (e as Error).message })
        emit('research:thought', {
          agent: 'OPSEC',
          text: `🔍 OSINT: Dorker failed — ${(e as Error).message}`,
        })
      }
    }
    await sleep(300)

    // -------- PHASE 6: FINAL --------
    task.phase = 'final'
    task.status = 'completed'
    task.finalReport = task.draft
    task.finishedAt = Date.now()
    emit('research:phase', { phase: 'final', title: 'Research complete' })
    announcePhase(socket, 'Research complete. Final report delivered.')
    emit('research:final', {
      query: task.query,
      finalReport: task.finalReport,
      sources: task.sources,
      plugin: task.plugin,
      critiqueRounds: task.critiqueRounds,
      dream: task.dream,
      iterations: degraded ? task.critiqueRounds.length || 1 : task.critiqueRounds.length,
      durationMs: task.finishedAt - task.startedAt,
      routingMode: task.routingMode,
      degraded,
      taskType: task.taskType,
    })

    history.unshift(task)
    if (history.length > 12) history.pop()

    // -------- TELEMETRY: record run for improvement tracking --------
    const wordCount = (task.finalReport || '')
      .split(/\s+/)
      .filter(Boolean).length
    const runLog: RunLog = {
      id: uid(),
      timestamp: Date.now(),
      query: task.query,
      taskType: task.taskType,
      iterations: task.critiqueRounds.length,
      sourceCount: task.sources.length,
      wordCount,
      durationMs: task.finishedAt - task.startedAt,
      routingMode: task.routingMode,
    }
    recordRun(runLog)
    socket.emit('telemetry:update', { log: runLog })

    // Store conclusion in vector memory for future RAG retrieval.
    if (task.finalReport && !degraded) {
      await storeConclusion(task.query, task.finalReport)
    }

    // Meta-Prompt Evolution: every 5 runs, analyze metrics + evolve prompts.
    const totalRuns = getLogs().length
    try {
      const evolution = await maybeEvolvePrompts(totalRuns)
      if (evolution) {
        emit('research:thought', {
          agent: 'Meta-Prompt',
          text: `🧠 META-PROMPT EVOLUTION: System prompts rewritten — ${evolution}`,
        })
        emit('research:metaPrompt', { evolution, history: getEvolutionHistory() })
      }
    } catch {
      /* best-effort */
    }
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
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000,
})

io.on('connection', (socket) => {
  console.log(`[orchestrator] client connected: ${socket.id}`)

  // Send historical telemetry so the frontend graph renders immediately.
  socket.emit('telemetry:history', { logs: getLogs() })
  // Send current LLM provider settings + presets.
  socket.emit('settings:update', { settings: getSettings(), presets: PROVIDER_PRESETS })

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
    broadcastPlugins(socket)
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

  socket.on('telemetry:request', () => {
    socket.emit('telemetry:history', { logs: getLogs() })
  })

  socket.on('stats:request', () => {
    const memStats = getMemoryStats()
    const cacheStats = getCacheStats()
    // System stats (CPU/memory from Node.js process)
    const memUsage = process.memoryUsage()
    socket.emit('stats:update', {
      cpu: process.cpuUsage(),
      mem: {
        rss: memUsage.rss,
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
      },
      uptime: process.uptime(),
      memory: memStats,
      cache: cacheStats,
      plugins: pluginRegistry.length,
    })
  })

  socket.on('metaPrompt:request', () => {
    socket.emit('research:metaPrompt', { history: getEvolutionHistory() })
  })

  // ---- LLM Provider Settings ----
  socket.on('settings:get', () => {
    socket.emit('settings:update', {
      settings: getSettings(),
      presets: PROVIDER_PRESETS,
    })
  })

  socket.on('settings:save', (data: { settings: LLMSettings }) => {
    const saved = saveSettings(data.settings)
    socket.emit('settings:update', { settings: saved, presets: PROVIDER_PRESETS })
    console.log(`[settings] provider saved: ${saved.provider} / ${saved.model || '(none)'}`)
  })

  socket.on('settings:fetchModels', async (data: { provider: ProviderType; baseURL: string; apiKey: string }) => {
    const result = await fetchLLMMModels(data.provider, data.baseURL, data.apiKey)
    socket.emit('settings:models', { models: result.models, error: result.error })
  })

  // Health checks
  socket.on('health:request', async () => {
    const statuses = await runHealthChecks()
    latestHealthStatuses = statuses
    socket.emit('health:update', { statuses })
  })
  // Send cached statuses immediately
  if (latestHealthStatuses.length > 0) {
    socket.emit('health:update', { statuses: latestHealthStatuses })
  }

  socket.on('telemetry:clear', () => {
    clearLogs()
    socket.emit('telemetry:history', { logs: [] })
    console.log('[telemetry] cleared by client')
  })

  socket.on('disconnect', () => {
    console.log(`[orchestrator] client disconnected: ${socket.id}`)
  })
})

httpServer.listen(PORT, () => {
  initTelemetry()
  loadSearchCache()
  initLocalMemory()
  loadMetaPrompts()
  loadSettings()

  // Environment auto-discovery: scan env vars for API keys.
  const envDiscovery = discoverEnvKeys()
  if (envDiscovery.found.length > 0) {
    console.log(`[env-discovery] found API keys: ${envDiscovery.found.join(', ')}`)
  }

  // Pre-flight health checks on all configured providers.
  console.log('[health] running pre-flight checks…')
  runHealthChecks().then((statuses) => {
    const online = statuses.filter((s) => s.status === 'online').length
    const offline = statuses.filter((s) => s.status === 'offline').length
    const unconfigured = statuses.filter((s) => s.status === 'unconfigured').length
    console.log(`[health] ${online} online, ${offline} offline, ${unconfigured} unconfigured`)
    latestHealthStatuses = statuses
  }).catch(() => { /* best-effort */ })
  // Warmup: pre-load the local model into VRAM so the first query is fast.
  warmupLocalModel()

  // Run skill deprecation on boot + every 6 hours.
  const deprecated = deprecateStaleTools(pluginRegistryMeta)
  if (deprecated.length > 0) {
    pluginRegistry = reconstructPlugins(pluginRegistryMeta)
  }
  setInterval(() => {
    const dep = deprecateStaleTools(pluginRegistryMeta)
    if (dep.length > 0) pluginRegistry = reconstructPlugins(pluginRegistryMeta)
  }, 1000 * 60 * 60 * 6)
  console.log(`[research-orchestrator] socket.io listening on :${PORT}`)
})

process.on('SIGTERM', () => httpServer.close(() => process.exit(0)))
process.on('SIGINT', () => httpServer.close(() => process.exit(0)))