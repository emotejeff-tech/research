# Worklog — Autonomous Research & Self-Learning System

Project: Multi-agent orchestration research system with glassmorphic 3D frontend.
Single user-visible route: `/`. Backend orchestration via WebSocket mini-service on port 3003.

## Architecture Overview
- **Frontend (Next.js, route `/`)**: Glassmorphic 3D hero (React Three Fiber), research input, real-time agent workflow node graph (reactflow), streaming log, actor-critic loop viz, plugin registry, sticky footer.
- **Mini-service (`mini-services/research-orchestrator`, port 3003)**: socket.io server running the multi-agent orchestration (Plan → Discovery → Synthesis → Generation → Critique loop) using z-ai-web-dev-sdk (LLM + web_search). Streams events to client. Maintains in-memory task state + plugin registry.
- **Event contract** (socket.io, path `/`, XTransformPort=3003):
  - client → server: `research:start`, `plugins:request`, `history:request`
  - server → client: `research:phase`, `research:thought`, `research:source`, `research:critique`, `research:iteration`, `research:plugin`, `research:final`, `research:error`, `plugins:list`, `history:list`, `connect`

---
Task ID: 0
Agent: orchestrator (main)
Task: Bootstrap project plan, worklog, and dependency setup.

Work Log:
- Explored existing Next.js 16 scaffold; confirmed shadcn/ui, framer-motion, prisma (sqlite), z-ai-web-dev-sdk present.
- Loaded LLM and web-search skills (z-ai-web-dev-sdk backend usage confirmed).
- Reviewed websocket example (socket.io path `/`, XTransformPort query param pattern).
- Defined architecture and socket event contract above.

Stage Summary:
- Plan locked in. Next: install 3D/visualization deps, create mini-service, update prisma schema, then build frontend + backend.

---
Task ID: 1
Agent: orchestrator (main)
Task: Build the full multi-agent research system end-to-end (backend mini-service + glassmorphic 3D frontend) and self-verify with Agent Browser.

Work Log:
- Installed deps: three, @react-three/fiber, @react-three/drei, reactflow, socket.io-client (+ @types/three) in main project; socket.io + z-ai-web-dev-sdk in mini-service.
- Updated prisma schema (ResearchTask, CustomPlugin models) + db:push.
- Built mini-service `mini-services/research-orchestrator/index.ts` (port 3003): socket.io server running Plan→Discovery→Synthesis→Critic→Evolution→Final orchestration with z-ai-web-dev-sdk (LLM chat.completions + functions.invoke('web_search')). Actor-Critic loop capped at 3 iterations. Retry+graceful degradation on LLM calls. 3 seed plugins pre-loaded. Streams events: research:phase/thought/source/iteration/critique/plugin/final/error + plugins:list + history:list.
- Built frontend (route `/`): 
  - globals.css: glassmorphic utilities (.glass, .glass-strong, .glass-hover), aurora blobs, grid overlay, custom scrollbar, pulse-ring, shimmer, gradient text, reactflow overrides, markdown prose.
  - layout.tsx: forced dark mode, NEXUS metadata.
  - orchestrator-store.ts: zustand store + socket.io client (io('/?XTransformPort=3003')) wiring all events.
  - Scene3D.tsx: R3F floating distorted glass icosahedrons + particle field + mouse parallax.
  - Background.tsx: fixed 3D + aurora blobs + grid + vignette.
  - WorkflowGraph.tsx: reactflow live execution DAG (Coordinator→subqueries→sources→Synthesis↔Critic→Evolution→Final) with glowing glass nodes.
  - StreamingLog.tsx, CriticLoop.tsx, PluginRegistry.tsx (code viewer), FinalReport.tsx (react-markdown + sources), HistoryPanel.tsx, ResearchConsole.tsx (3D tilt input), Header.tsx, Footer.tsx (sticky), GlassCard.tsx.
  - page.tsx: hero + pipeline strip + live workspace (graph+stream) + critic+plugins + final report + architecture features + history.
- Fixed a critical bug: in GlassCard.tsx the rest param was named `...motion`, shadowing the framer-motion `motion` import and causing "Element type is invalid" 500. Renamed to `...rest`.
- Agent Browser self-verification (via gateway port 81 so XTransformPort routing works):
  - Page renders cleanly, no console/runtime errors.
  - Socket connects ("orchestrator live"), 3 seed plugins load.
  - Launched a real research goal (small modular reactors). Verified live: Coordinator decomposed into 3 sub-queries, Discovery found 12 sources, Synthesis drafted, Critic flagged real flaws (missing citations, unsupported claims) across 3 iterations, Evolution generated & cached a new `smr_research_analyzer` Python plugin (registry 3→4 tools), Final report delivered in 87.4s with evidence list. Run archived with rerun option.
  - Verified mobile (390x844) + desktop layouts; sticky footer intact.

Stage Summary:
- System fully functional end-to-end through the gateway. Multi-agent orchestration, actor-critic self-critique, and self-teaching plugin evolution all verified working with a real LLM-driven run. No lint errors, no runtime errors. Dev server (3000) + orchestrator mini-service (3003) both running.

---
Task ID: 2
Agent: orchestrator (main)
Task: Implement Phase 2 blueprint refinements — (1) agents/+tools/ directory architecture, (2) per-phase ambient glow on active panels, (3) model fallback pipeline so 402/credit exhaustion never freezes a run.

Work Log:
- Refactored the single-file orchestrator into the blueprint's `backend/agents` + `backend/tools` layout:
  - agents/{planner,researcher,synthesizer,critic,evolution}.ts
  - tools/{sdk,llm,web_search}.ts
  - shared types.ts + util.ts
  - index.ts is now a thin server + orchestration loop calling the agents.
- tools/llm.ts implements the model fallback pipeline (Step 4): `llm()` (primary, retry+backoff) → `llmWithFallback()` returns degraded on exhaustion → `degradedSynthesis()` compiles a cited Markdown report from raw web snippets with NO llm. Mirrors the litellm model_pipeline concept, adapted to z-ai-web-dev-sdk (no Ollama available → degraded no-LLM path is the fallback).
- Orchestrator wires degraded mode through every phase: planner fail → single-query discovery (search still runs); synthesis fail → degraded snippet compilation + skip critic loop; critic fail → accept draft; evolution fail → skip plugin. Emits a new `research:routing` event ({mode,reason}) so the UI can react. Final payload now carries `routingMode` + `degraded`.
- Frontend Step 3 glow: added `.agent-glow` + per-phase `drop-shadow` classes (planning=emerald, discovery=teal, synthesis=amber, critique=rose, generation=orange, final=emerald) with a 2.6s breathe pulse + 0.6s filter transition in globals.css. New `usePhaseGlow(roles)` hook applies the active phase's glow to the matching panel: ResearchConsole(planning), Execution Graph(all active phases), StreamingLog(discovery), CriticLoop(critique), PluginRegistry(generation), FinalReport(synthesis/final).
- UI routing indicators: ResearchConsole now shows a "primary"/"fallback" Cpu chip + amber "degraded" badge; FinalReport shows a "degraded"/"delivered" badge and an amber degraded-mode banner with the failure reason; store tracks routingMode/routingReason and logs Router thoughts.
- Fixed a bootstrap bug: tools/sdk.ts initially failed to write (dir missing) → "Cannot find module './sdk'"; recreated the file and cleanly restarted the mini-service.
- Agent Browser self-verification (via gateway :81):
  - Normal run (perovskite solar cells): primary routing held, Coordinator→3 branches→12 sources→3 critique iterations→plugin `perovskite_research_fetcher` spawned (registry 3→4)→DELIVERED in 51.8s. No errors.
  - Degraded run (forced 402 via env-gated hook): Router emitted "Model routing → degraded", planner fell back to single-query discovery, search found 4 sources, synthesis compiled degraded draft, plugin skipped gracefully, run COMPLETED in 3.8s (no freeze) with degraded badge + banner. Reverted the hook afterward.
  - Final reload: lint clean, page loads, socket "orchestrator live", primary routing, 3 seed plugins, no console/runtime errors.

Stage Summary:
- Phase 2 blueprint fully implemented & verified. The orchestrator now matches the agents/+tools/ architecture, active panels pulse with phase-colored ambient glow, and the system never freezes on LLM exhaustion — it degrades to a sourced no-LLM report and surfaces the mode in the UI. Both primary and degraded paths browser-verified end-to-end.

---
Task ID: 3
Agent: orchestrator (main)
Task: Add mode-aware synthesis — when the goal is a research/conclusion question, agents must follow the strict independent-research-analyst methodology (primary data only, strip narrative, show logic, definitive conclusion). When the goal is a blueprint/design request, switch to best-ideas actionable design using latest research.

Work Log:
- Added TaskType ('research'|'blueprint') to backend types + TaskState, and to frontend store + HistoryItem + finalMeta.
- agents/planner.ts: Coordinator now classifies the goal AND decomposes it in ONE LLM call (token-efficient — no extra round-trip). Returns { subqueries, taskType }. Emits a new `research:taskType` event.
- agents/synthesizer.ts: two mode-aware system prompts:
  - research → the user's exact independent-analyst rules (Primary Data Only / Strip the Narrative / Show Your Logic / Form an Independent Conclusion, no "some say X others say Y" hedging).
  - blueprint → senior-architect best-ideas prompt (core objectives, architecture/step-by-step, key tech with rationale preferring newest approaches, concrete next actions).
- agents/critic.ts: two mode-aware criteria sets:
  - research → flags hedging, narrative/wording adoption, non-primary data (opinion/PR/consensus), missing logic chain, unsupported claims.
  - blueprint → flags vague/non-actionable objectives, missing architecture, outdated tech when sources show better, missing concrete next actions.
- Orchestrator index.ts: passes taskType to synthesize() + critique() in both the normal loop and the degraded branch; emits research:taskType + a Coordinator thought announcing the classification; includes taskType in research:final + history:list payloads.
- Frontend store: handles research:taskType event; tracks taskType; resets it on start/reset; reads it from final payload.
- UI:
  - ResearchConsole: new task-type badge (Microscope/research=teal vs Wrench/blueprint=orange) with tooltip describing the active methodology; updated examples to include both a research ("Is LFP objectively safer than NMC?") and a blueprint ("Design a blueprint for a decentralized AI inference network") prompt.
  - FinalReport: title/subtitle/icon/accent all switch by mode ("Independent Research Analysis" teal vs "Actionable Blueprint Output" orange). New teal methodology banner appears ONLY in non-degraded research mode explaining the analyst rules + that the Critic verified them. Degraded banner unchanged.
- Agent Browser self-verification (via gateway :81):
  - Research query "Is LFP objectively safer than NMC for grid storage?": Coordinator emitted "Classified as a RESEARCH goal"; research badge shown; report title = "Independent Research Analysis"; Critic flagged "Reliance on non-primary data - Reddit discussions are not primary scientific data" + "Unsupported claims" + "needs step-by-step reasoning" (exactly the analyst criteria); methodology banner displayed; DELIVERED in 80.5s, 2 iterations.
  - Blueprint query "Design a blueprint for a decentralized AI inference network": Coordinator emitted "Classified as a BLUEPRINT goal"; blueprint badge shown (orange); report title = "Actionable Blueprint Output"; NO methodology banner (correct — banner is research-only); 3 critique iterations enforcing blueprint criteria (vague/outdated/missing-architecture); DELIVERED in 56.5s.
  - No console/runtime errors in either run. Lint clean.

Stage Summary:
- The engine now auto-detects research vs blueprint goals and applies the correct methodology end-to-end. Research queries get the strict independent-analyst treatment (primary data, no narrative adoption, logic shown, definitive verdict) with a Critic that specifically catches hedging and non-primary sources; blueprint queries get a best-ideas actionable design with a Critic that catches vagueness and outdated approaches. Both modes browser-verified.

---
Task ID: 4
Agent: orchestrator (main)
Task: Add an autonomous improvement tracker — telemetry logging that records metrics for every run, persists them, and surfaces them on the frontend as a historical line graph (convergence speed / fact density / execution efficiency).

Work Log:
- Backend telemetry module (mini-services/research-orchestrator/telemetry.ts): RunLog interface + JSONL persistence (telemetry.jsonl). Loads last 50 on startup (survives restarts), append on record, in-memory cache for fast serving. clearLogs() wipes disk+memory. Chose JSONL over Prisma because the orchestrator is an independent mini-service on port 3003 — keeps it self-contained (the spec explicitly allows "a local database or a JSON lines file").
- Orchestrator index.ts: imports telemetry; calls initTelemetry() on listen; on run completion builds a RunLog {id,timestamp,query,taskType,iterations,sourceCount,wordCount,durationMs,routingMode} and recordRun()+emits telemetry:update. On every client connect emits telemetry:history (so the graph renders immediately). Added telemetry:request (re-emit history) and telemetry:clear (wipe) socket handlers.
- Frontend store (orchestrator-store.ts): added RunLog type + telemetryLogs state + clearTelemetry action. Handles telemetry:history (replace array) and telemetry:update (append, cap 50).
- ImprovementGraph.tsx (recharts, already in deps): glassmorphic panel with the final-phase glow. Three trend stat cards comparing last-3-runs avg vs earlier avg with % delta + colored arrows (green=improving, rose=regressing):
  - Execution Efficiency (duration, ↓=faster, emerald)
  - Convergence Speed (iterations, ↓=better 1st draft, amber)
  - Fact Density (sources/100words, ↑=denser, rose)
  Dual-axis LineChart: left axis=duration seconds (emerald solid), right axis=loops (amber solid) + fact density (rose dashed). Custom glass tooltip showing all 3 metrics + query. Empty-state placeholder + "clear" button (emits telemetry:clear). Legend + explanatory footer.
- page.tsx: added ImprovementGraph section between FinalReport and the architecture features.
- Agent Browser self-verification (via gateway :81):
  - Empty state: "0 RUNS" + placeholder renders cleanly, no errors.
  - Ran CCS query (research, 65.5s, 3 iter) → telemetry recorded. Ran lab-grown meat query (degraded, 41.2s, 3 iter) → telemetry recorded. JSONL now holds 4 runs total (incl. 2 from prior task verification).
  - Live update: telemetry:update fired on completion, panel went 3→4 RUNS without reload, chart added #4 point live.
  - Persistence: full reload → telemetry:history sent all 4 logs, chart rendered #1–#4 with no duplicates.
  - Trend cards show real computed values + deltas: Execution 58.6s (4% faster ↓), Convergence 3.0 loops (11% better ↓), Fact Density (11% denser ↑).
  - clear button wired (telemetry:clear → clearLogs → empty history). No console/runtime errors. Lint clean.

Stage Summary:
- Autonomous improvement tracking is live. Every completed run persists a RunLog to telemetry.jsonl and broadcasts telemetry:update; the frontend graphs convergence speed, fact density, and execution efficiency over time with trend deltas, and the data survives restarts. Browser-verified with 4 real runs (live update + reload persistence). The user can now watch the agents self-optimize across runs.

---
Task ID: 5
Agent: orchestrator (main)
Task: Phase 2 Refinement — (1) multi-tier LLM pipeline with local-model fallback tier, (2) premium glassmorphic + refined phase-glow palette, (3) phase-glow wrapper hook alignment.

Work Log:
- Step 1 (directory architecture): confirmed already in place from Task 2 (agents/{planner,researcher,synthesizer,critic,evolution}.ts + tools/{sdk,llm,web_search}.ts + index.ts + types.ts). No rework needed.
- tools/llm.ts: restructured from 2-tier (primary→degraded) to 3-tier pipeline matching the blueprint's "primary cloud gateway vs local hardware fallback" topology:
  - Tier 1 primary: z-ai cloud gateway (retry+backoff).
  - Tier 2 local: new localLLM() — OpenAI-compatible fetch to LOCAL_LLM_BASE_URL (Ollama/LM Studio), env-gated + 4s fast-fail so it never stalls when unconfigured/unreachable. Configurable model via LOCAL_LLM_MODEL.
  - Tier 3 degraded: no-LLM snippet compilation (existing).
  - llmWithFallback() steps tier1→tier2(if configured)→tier3, recording which tier served the call.
  - LLMResult gained a `tier` field ('primary'|'local'|'degraded').
- agents/synthesizer.ts: propagates tier from LLMResult; orchestrator emits research:routing with {mode, tier, reason} — distinct messages for local-tier engagement vs full degradation. Router thoughts surface "served by local model tier" when tier 2 engages.
- Frontend store: added routingTier state ('primary'|'local'|'degraded'), captured from research:routing; reset on start/reset.
- Step 2 (premium glass + glow): globals.css gained .glass-panel-premium (blur 20px, saturate 200%, deeper shadow, smooth filter transition). Refined the phase-glow palette to the blueprint's colors with stronger 35px drop-shadows + matching border tints: planning=sky(#38bdf8), discovery=emerald(#10b981), synthesis=violet(#a78bfa), critique=amber(#f59e0b), generation/evolution=pink(#ec4899), final=emerald. (Blue/sky explicitly requested by user for planning — permitted.)
- Step 3 (glow hook): usePhaseGlow kept its array-based signature for backward compat; added usePhaseGlowFor(single) convenience overload matching the blueprint's API shape. Glow now also tints the panel border via the CSS class.
- Applied .glass-panel-premium (via GlassCard `premium` prop, added to GlassCard) to all key panels: Execution Graph, StreamingLog, CriticLoop, PluginRegistry, FinalReport, ImprovementGraph.
- ResearchConsole routing chip now 3-state: "primary" (emerald) / "local model" (sky) / "degraded" (amber) with tier-specific tooltips, so the user can see at a glance which inference tier served the run.
- Agent Browser self-verification (via gateway :81):
  - Page loads cleanly, no console/runtime errors. Telemetry persisted (5 runs from JSONL loaded on connect).
  - Ran "Is quantum computing a near-term threat to RSA encryption?": primary tier held end-to-end ("Draft 1 produced via primary tier", "Draft 2 produced via primary tier"), 53.1s, 2 critique iterations, DELIVERED. Research-mode Critic still caught non-primary sources (LinkedIn/Reddit). Telemetry live-updated to 6 RUNS.
  - Premium glass + refined glow render correctly (sky glow on planning, emerald on discovery, etc.).
  - Lint clean.

Stage Summary:
- 3-tier inference pipeline live: primary z-ai → local Ollama-compatible (env-gated, fast-fail) → degraded no-LLM. The local tier is architecturally complete and will engage automatically if LOCAL_LLM_BASE_URL is set; in this environment (no Ollama) it skips cleanly to degraded. Premium glass + refined phase-glow palette (sky/emerald/violet/amber/pink) applied to all panels with a 3-state routing chip showing the active tier. Browser-verified; lint clean.

---
Task ID: 6
Agent: orchestrator (main)
Task: Build the Self-Teaching Loop (Evolution Engine) — gap analysis → tool authoring → sandbox test → disk registry → runtime execution → self-correction.

Work Log:
- agents/evolution.ts: completely refactored from a single LLM call into a 4-stage Self-Teaching Loop:
  - Stage 1 analyzeGap(): Gap Analysis agent examines the research context (query + sources + sub-queries + existing tool registry) and identifies ONE specific missing capability. Returns {capability, rationale}.
  - Stage 2 authorTool(): Tool Authoring agent generates self-contained Python (stdlib only, main() entry point, CLI arg, try/except, <45 lines). Returns {name, description, code}.
  - Stage 3 testTool(): writes the code to custom_plugins/<name>.py on disk and runs `python3 -m py_compile` in an isolated child process (8s timeout). Returns {passed, error?}.
  - Self-correction: if compilation fails, patchTool() feeds the error back to the authoring LLM which rewrites the entire script; the patched code is re-tested. One patch attempt; if it still fails, rollbackTool() deletes the file and the tool is not registered.
  - Stage 4: on success, returns a Plugin with gapAnalysis/testStatus/patched metadata.
  - The full evolve() function takes an onStage callback so the orchestrator can stream each stage to the client.
- tools/plugin_runner.ts (new): runEvolvedTool(name, args) executes the agent's self-generated Python via `python3` in an isolated child process with 8s timeout, safe arg escaping, and returns {stdout, stderr, ok}. listEvolvedTools() reads custom_plugins/ dir at runtime (hot-swap manifest).
- Orchestrator index.ts: replaced the old single-call generation phase with the full staged loop. Emits research:evolution events for each stage (gap/gap_done/author/test/patch/register/done/exec) + corresponding research:thought messages. After registration, hot-swaps the new tool by executing it with a sample arg (first sub-query); if runtime execution errors, the stack trace is surfaced as a Critic self-correction thought. The plugin carries executionStatus + executionResult.
- Frontend store: Plugin type extended with gapAnalysis/testStatus/testError/executionResult/executionStatus/patched. Added evolutionStage state + research:evolution handler. Reset on start/reset.
- PluginRegistry.tsx: rebuilt with the Self-Teaching Loop UX:
  - EvolutionProgress bar appears during the generation phase showing the 5 stages (Gap→Author→Test→Register→Execute) lighting up in sequence, with a "self-correction: patching compile error…" indicator when patching.
  - PluginCard now shows test-status badges (TESTED=emerald / PATCHED=amber / FAILED=rose) + execution badges (RAN=emerald / RUNTIME ERR=rose).
  - Expanded card reveals: Gap Analysis panel (sky) showing the identified missing capability, Runtime Execution panel (emerald/rose) showing stdout/stderr, and the full Python source.
  - Panel retitled "Evolution Engine · Self-Teaching Loop" with subtitle "gap → author → sandbox → register → execute".
- Verified python3 + py_compile available in the sandbox (Python 3.12.13).
- Agent Browser self-verification (via gateway :81):
  - Ran "Evaluate the evidence on whether intermittent fasting improves metabolic health markers in humans": full pipeline executed — Gap Analysis identified "Extract and standardize metabolic health marker measurements across different intermittent fasting studies"; Tool Authoring generated extract_metabolic_markers.py (2KB, stdlib only: sys/re/collections); Sandbox Test (py_compile) passed; registered to custom_plugins/ on disk; Runtime Execution hot-swapped and ran successfully → "No metabolic markers found in the input text". Run completed 68.6s, 3 critique iterations, DELIVERED.
  - Verified the .py file physically exists on disk, compiles cleanly (exit 0), and runs standalone producing the same output the orchestrator reported.
  - UI shows TESTED + RAN badges on the plugin card; EvolutionProgress bar animated through all 5 stages during the run.
  - 2 evolved tools now on disk (extract_metabolic_markers.py + hardware_benchmark.py from a concurrent run). Telemetry at 10 runs. Lint clean.

Stage Summary:
- The Self-Teaching Loop is live and verified. The agent now autonomously identifies capability gaps from live research, authors Python tools, sandbox-tests them with py_compile (with self-correction on failure), persists them to a real custom_plugins/ directory on disk, and hot-swaps them into runtime execution — all streamed live to the frontend with per-stage progress and per-tool test/execution badges. Browser-verified end-to-end with a real evolved tool that compiles and runs.

---
Task ID: 7
Agent: orchestrator (main)
Task: Make the agent dig deep and dream on possibilities (best outcomes, new goals, relevant papers) + rebuild the performance graph as a clear percentile-based improvement tracker showing improved/disimproved over time.

Work Log:
- Created agents/dreamer.ts — the Dreamer: after the Actor-Critic loop converges, it reflects on ALL data (query + synthesis + sources), dreams on possibilities, and returns a structured Dream {bestOutcome, newGoals[], possibilities[], papers[], reflection}. It also live-searches the web for the top paper topic to enrich references with real results. The dream is appended to the final report as a "✦ Dreamer's Reflection & Possibilities" section.
- Enhanced agents/researcher.ts: added an academic-paper search pass (arxiv/scholar-oriented query) after the standard discovery loop, so sources now include research papers for deeper grounding.
- Added 'reflection' to the Phase type + Dream interface to types.ts. Wired the Dreamer as a new PHASE 3.5 (reflection) between critique and generation in index.ts: emits research:phase(reflection) + research:thought + research:dream events; appends dream Markdown to the draft; includes dream in the research:final payload. Skipped in degraded mode.
- Frontend store: added Dream type + 'reflection' phase + dream state + research:dream handler; reset in startResearch/reset; updated PHASE_LABELS.
- Created DreamPanel.tsx: glassmorphic panel with violet reflection glow showing Best Possible Outcome (violet card), New Goals (emerald), Possibilities (amber), Relevant Papers (sky, with live-enriched references), and Reflection (italic). Empty state + dreaming skeleton state + dreamed badge.
- Added .agent-glow-reflection (violet) to globals.css.
- Added DreamPanel to page.tsx between FinalReport and ImprovementGraph.
- Updated ResearchConsole PHASE_FLOW to include the Dream phase (violet) in the execution pipeline.
- Completely rebuilt ImprovementGraph.tsx as a percentile-based improvement tracker:
  - improvementPercentile(): computes a 0-100 score per run relative to baseline (Run #1), where 50=baseline, 100=maximally improved, 0=maximally disimproved. Three vectors weighted equally: duration (lower=better), iterations (lower=better), fact density (higher=better).
  - HERO gauge: an animated SVG circular gauge showing the compound score (0-100) with a colored verdict badge (IMPROVED/DISIMPROVED/STABLE) + delta percentage + plain-English explanation ("The engine is performing X% better/worse than baseline...").
  - Per-vector percentile cards: three cards (Efficiency/Convergence/Density) each showing the current value, delta %, and a 0-100 percentile bar with disimproved/baseline/improved labels.
  - Trend area chart: improvement score over time with a baseline reference line at y=50, gradient fill, and tooltip showing score + delta + query.
  - Clear footer explaining: "Score above the baseline line = improved · below = disimproved."
- Agent Browser self-verification (via gateway :81):
  - Both new panels render on load (Dreamer empty state + percentile graph with 10 existing runs showing "STABLE").
  - Launched "Evaluate whether brain-computer interfaces will achieve consumer viability within the next decade": full pipeline ran — Coordinator (3 branches), Discovery (12 sources + academic pass), Synthesis+Critic (3 iterations), Dreamer (5 new goals, 7 possibilities, 5 relevant papers surfaced), Evolution, Final. Completed 120.4s, DELIVERED. Dreamer's reflection appended to final report. Telemetry updated to 11 RUNS.
  - Percentile graph shows compound score gauge + per-vector percentile bars + trend area chart with baseline reference line.
  - No console/runtime errors. Lint clean.

Stage Summary:
- The agent now digs deep and dreams: after the Critic converges, the Dreamer reflects on all data, envisions best-possible outcomes, proposes new goals, surfaces possibilities, and enriches them with live-searched relevant papers — all appended to the final report and displayed in a dedicated glassmorphic DreamPanel. The performance graph is rebuilt as a clear percentile tracker: a compound 0-100 improvement gauge (50=baseline) with an IMPROVED/DISIMPROVED/STABLE verdict, per-vector percentile bars, and a trend area chart with a baseline reference line — so you can see at a glance how much the engine has improved or disimproved over time. Browser-verified end-to-end.
