<!--
  INTELLAGENT — Autonomous Multi-Agent Research Engine
  ==============================================================
  A self-critiquing, self-teaching research platform built on a split-agent architecture.
  Coordinator → Discovery → Synthesis ↔ Critic (actor–critic loop) → Evolution → Dreamer
-->

<div align="center">

# 🔬 INTELLAGENT

<h3><em>An autonomous multi-agent research engine that critiques its own mind and teaches itself new tools.</em></h3>

<p>
  <a href="https://github.com/emotejeff-tech/research/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/emotejeff-tech/research/ci.yml?branch=main&style=flat-square&logo=github-actions&logoColor=white&label=CI" alt="CI Status"></a>
  <a href="https://github.com/emotejeff-tech/research/blob/main/LICENSE"><img src="https://img.shields.io/github/license/emotejeff-tech/research?style=flat-square&color=00d4ff" alt="License"></a>
  <a href="https://github.com/emotejeff-tech/research/stargazers"><img src="https://img.shields.io/github/stars/emotejeff-tech/research?style=flat-square&color=ec4899" alt="Stars"></a>
  <a href="https://github.com/emotejeff-tech/research/issues"><img src="https://img.shields.io/github/issues/emotejeff-tech/research?style=flat-square&color=fb7185" alt="Issues"></a>
  <a href="https://github.com/emotejeff-tech/research/discussions"><img src="https://img.shields.io/github/discussions/emotejeff-tech/research?style=flat-square&color=34d399" alt="Discussions"></a>
  <br>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.0-3178c6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript"></a>
  <a href="https://nextjs.org/"><img src="https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=next.js&logoColor=white" alt="Next.js"></a>
  <a href="https://bun.sh/"><img src="https://img.shields.io/badge/Bun-1.0-000000?style=flat-square&logo=bun&logoColor=white" alt="Bun"></a>
  <a href="https://tailwindcss.com/"><img src="https://img.shields.io/badge/TailwindCSS-4-06b6d4?style=flat-square&logo=tailwindcss&logoColor=white" alt="TailwindCSS"></a>
  <a href="https://zustand-demo.pmnd.rs/"><img src="https://img.shields.io/badge/Zustand-5-000000?style=flat-square&logo=zustand&logoColor=white" alt="Zustand"></a>
  <a href="https://socket.io/"><img src="https://img.shields.io/badge/Socket.io-4.8-010101?style=flat-square&logo=socket.io&logoColor=white" alt="Socket.io"></a>
</p>

</div>

---

## 🎯 What is This?

**Research Orchestrator** is a production-grade, split-agent research platform that doesn't just *answer* questions—it **investigates** them. Built on an **actor–critic architecture** with a **self-teaching evolution loop**, it decomposes a research goal into a live execution graph, searches the web, synthesizes evidence, verifies its own drafts through iterative critique, and permanently caches new capabilities as reusable plugins for future runs.

<table>
<tr>
<td width="50%" valign="top">

### 🧠 Core Philosophy
Traditional LLM pipelines are **single-pass**: prompt → response. They hallucinate, exhaust tokens, and can't learn. Research Orchestrator inverts this:

| Traditional Pipeline | Research Orchestrator |
|---------------------|----------------------|
| One model, one shot | **5 specialized agents** in a DAG |
| No verification | **Actor–Critic loop** (max 3 iterations) |
| Static toolset | **Self-teaching**: writes, tests & registers new Python tools |
| Opaque process | **Live 3D glass UI** streaming every thought, source & decision |
| Single provider | **Hybrid routing**: cloud → local → degraded fallback |

</td>
<td width="50%" valign="top">

### 🎬 What It Feels Like
> You type: *"Evaluate whether nuclear fusion will reach net-positive commercial energy this decade"*

1. **Coordinator** splits it into 4–6 targeted sub-queries
2. **Discovery** agents hit Tavily/Exa/You.com in parallel, caching results
3. **Synthesis** drafts a cited report
4. **Critic** tears it apart—finds unsupported claims, missing evidence, logical gaps
5. **Loop** (up to 3×): Synthesis revises → Critic re-verifies
6. **Evolution** spots a missing capability (e.g. "need a tokamak physics calculator") → writes a Python tool, compiles it, registers it permanently
7. **Dreamer** reflects: best outcome, new research angles, relevant papers
8. **OPSEC audit** scrubs PII, rotates User-Agents
9. **Final report** delivered with full provenance, critique history & telemetry

</td>
</tr>
</table>

---

## ✨ Feature Highlights

<div align="center">

| Feature | Description |
|---------|-------------|
| 🕸️ **Multi-Agent DAG** | Coordinator → Discovery → Synthesis ↔ Critic → Evolution → Dreamer — rendered live as a 3D force-directed graph |
| 🎭 **Actor–Critic Loop** | Dedicated Critic agent verifies every draft; max 3 revisions to prevent token exhaustion |
| 🧬 **Self-Teaching Evolution** | When a capability gap is detected, Evolution agent authors a Python tool, sandbox-tests it, caches it to `custom_plugins/` registry |
| 🔄 **Hybrid LLM Routing** | Primary (OpenRouter/Anthropic) → Local (Ollama) → Degraded (no-LLM snippet compile) with `research:routing` events |
| 🛡️ **OPSEC & Safety** | Automatic PII scrubbing, User-Agent rotation, adversarial **Saboteur** injects poisoned sources to stress-test Critic |
| 🧠 **RAG Memory** | Local TF-IDF memory stores past conclusions; retrieved before new searches |
| 🐝 **Swarm Planner** | For blueprint/design tasks, spawns 3 parallel planners (Security/Performance/UX) |
| 🔬 **Hypothesis Engine** | Generates 3 mutually exclusive hypotheses + disproof queries to neutralize confirmation bias |
| 🎙️ **Voice I/O** | Whisper STT + VoiceBox TTS — speak your query, hear the report |
| 📊 **Live Telemetry** | Hardware stats, cache hit rates, plugin usage, critique iterations — all streamed via Socket.io |

</div>

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           RESEARCH ORCHESTRATOR                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────┐  │
│  │  FRONTEND    │◄───│  SOCKET.IO   │◄───│  ORCHESTRATOR│───►│  TOOLS   │  │
│  │  (Next.js 16)│    │  (Port 3003) │    │  (Bun/TS)    │    │  REGISTRY│  │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘    └────┬─────┘  │
│         │                   │                   │                   │        │
│         ▼                   ▼                   ▼                   ▼        │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                        AGENT EXECUTION GRAPH                           │  │
│  │  ┌──────────┐   ┌───────────┐   ┌───────────┐   ┌─────────┐          │  │
│  │  │ PLANNER  │──►│ DISCOVERY │──►│ SYNTHESIS │◄─►│ CRITIC  │  (≤3 iters)│  │
│  │  │Coordinate│   │  Search   │   │  Draft    │   │ Verify  │            │  │
│  │  └──────────┘   └───────────┘   └─────┬─────┘   └────┬────┘          │  │
│  │                                        │            │                │  │
│  │                                        ▼            ▼                │  │
│  │                                 ┌─────────────┐  ┌──────────┐        │  │
│  │                                 │  EVOLUTION  │  │  DREAMER │        │  │
│  │                                 │  (New Tools)│  │ Reflection│        │  │
│  │                                 └──────┬──────┘  └──────────┘        │  │
│  │                                        │                              │  │
│  │                                        ▼                              │  │
│  │                                 ┌─────────────┐                       │  │
│  │                                 │   OPSEC     │                       │  │
│  │                                 │  AUDIT/SCRUB│                       │  │
│  │                                 └─────────────┘                       │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 16 (App Router), React 19, TypeScript 5, TailwindCSS 4, Framer Motion, Three.js / React Three Fiber |
| **State** | Zustand (client) + Socket.io (real-time sync) |
| **Backend** | Bun + TypeScript, Socket.io server on :3003 |
| **LLM Providers** | OpenRouter, Anthropic, OpenAI, Ollama (local), custom OpenAI-compatible |
| **Search** | Tavily, Exa, You.com, TinyFish, Nimbler (pluggable) |
| **Memory** | Local TF-IDF + BM25 memory (no Pinecone/Supabase) |
| **Sandbox** | Daytona / E2B / Python `py_compile` for plugin testing |
| **Voice** | VoiceBox (Whisper STT + TTS) |
| **Observability** | Custom telemetry + health checks (LLM, Search, Vector, Sandbox) |

---

## 🚀 Quick Start

### Prerequisites
- **Bun** ≥ 1.0 (`curl -fsSL https://bun.sh/install | bash`)
- **Node.js** ≥ 20 (for Next.js frontend)
- **API Keys** (at least one LLM provider + one search provider)

### 1. Clone & Install

```bash
git clone https://github.com/emotejeff-tech/research.git
cd research

# Root (Next.js frontend)
bun install

# Mini-service (orchestrator backend)
cd mini-services/research-orchestrator
bun install
cd ../..
```

### 2. Configure Environment

Create `.env.local` in **both** `research/` and `mini-services/research-orchestrator/`:

```bash
# ─── LLM Provider (pick one or more) ───
OPENROUTER_API_KEY=sk-or-...          # Recommended for cloud
# ANTHROPIC_API_KEY=sk-ant-...
# OPENAI_API_KEY=sk-...
# OLLAMA_BASE_URL=http://localhost:11434/v1  # For local

# ─── Search Providers (at least one) ───
TAVILY_API_KEY=tvly-...
# EXA_API_KEY=...
# YOUCOM_API_KEY=...
# TINYFISH_API_KEY=...
# NIMBLER_API_KEY=...

# ─── Local Memory (built in — no Pinecone/Supabase) ───
PINECONE_API_KEY=...
NO CLOUD MEMORY REQUIRED — local TF-IDF/BM25 memory is built in
# OR
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=...

# ─── Sandbox for Plugin Testing (optional) ───
DAYTONA_API_KEY=...
DAYTONA_SERVER_URL=...
# OR
E2B_API_KEY=...

# ─── Voice (optional) ───
VOICEBOX_URL=http://localhost:17493
VOICEBOX_API_KEY=...
```

> 💡 **Pro tip**: The UI has a **Settings modal** (gear icon) where you can configure providers, models, and keys at runtime — they're persisted to `settings.json` in the orchestrator.

### 3. Run Everything

**Windows easiest way:** run the all-in-one script:

```powershell
powershell -ExecutionPolicy Bypass -File start.ps1
```

This starts both the frontend and backend in separate PowerShell windows.

**Manual method:**

```bash
# Terminal 1: Orchestrator backend (port 3003)
cd mini-services/research-orchestrator
bun run dev

# Terminal 2: Next.js frontend (port 3000)
cd ../..
bun run dev
```

Open **http://localhost:3000** — you should see the glass-morphic research console with a pulsing green "Live" indicator.

---

## 🖥️ Usage Walkthrough

### 1. Launch a Research Task
Type a goal in the console (or pick an example):
> *"Compare CRISPR delivery vectors: AAV vs lipid nanoparticles — which is more clinically viable?"*

Hit **Enter** or click **Launch Research**.

### 2. Watch the Live Pipeline
- **Execution Graph** (left): DAG updates in real-time — nodes = agents, edges = data flow
- **Streaming Log** (right): Every thought, source, critique, and tool call
- **Critic Loop**: Watch verdicts (PASS/REVISE) with specific issues
- **Plugin Registry**: New tools appear here permanently after Evolution creates them

### 3. Review the Output
When the run completes (`phase: final`):
- **Final Report**: Cited, structured markdown
- **Critique History**: All iterations with diffs
- **Dream Panel**: Best outcome, new research angles, relevant papers
- **OPSEC Audit**: What was scrubbed, UA rotation status
- **Telemetry**: Duration, tokens, cache hits, routing tier

### 4. Re-use Learned Tools
Next time you ask a related question, the **Evolution agent** detects the cached plugin and executes it automatically — no re-invention needed.

---

## 🛠️ Development Guide

### Project Structure

```
research/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/               # API routes (TTS, STT, health)
│   │   ├── page.tsx           # Main console (this is the UI)
│   │   └── layout.tsx
│   ├── components/
│   │   ├── orchestrator/      # All research-specific UI (20+ components)
│   │   │   ├── ResearchConsole.tsx
│   │   │   ├── WorkflowGraph.tsx      # 3D force-directed DAG
│   │   │   ├── StreamingLog.tsx
│   │   │   ├── CriticLoop.tsx
│   │   │   ├── PluginRegistry.tsx
│   │   │   ├── DreamPanel.tsx
│   │   │   ├── OpsecPanel.tsx
│   │   │   ├── HardwareTelemetry.tsx
│   │   │   └── ... (20+ components)
│   │   └── ui/                # shadcn/ui primitives
│   ├── hooks/                 # useMobile, useToast
│   └── lib/
│       ├── orchestrator-store.ts  # Zustand + Socket.io client
│       └── utils.ts
├── mini-services/
│   └── research-orchestrator/     # Bun backend
│       ├── index.ts               # Socket.io server + orchestration loop
│       ├── agents/                # 9 agent implementations
│       │   ├── planner.ts
│       │   ├── researcher.ts
│       │   ├── synthesizer.ts
│       │   ├── critic.ts
│       │   ├── evolution.ts
│       │   ├── dreamer.ts
│       │   ├── devils_advocate.ts
│       │   ├── hypothesis_engine.ts
│       │   ├── saboteur.ts
│       │   └── swarm_planner.ts
│       ├── tools/                 # Capabilities & infrastructure
│       │   ├── plugin_registry.ts
│       │   ├── plugin_runner.ts
│       │   ├── search_cache.ts
│       │   ├── local_memory.ts        # local TF-IDF/BM25 memory store
│       │   ├── settings.ts
│       │   ├── health_check.ts
│       │   ├── meta_prompts.ts
│       │   └── voicebox.ts
│       ├── types.ts
│       ├── util.ts
│       └── custom_plugins/        # Auto-generated tools (gitignored)
└── package.json
```

### Key Commands

```bash
# Frontend
bun run dev          # Next.js dev server (port 3000)
bun run build        # Production build
bun run lint         # ESLint

# Backend
cd mini-services/research-orchestrator
bun run dev          # Socket.io server (port 3003)

# Database (Prisma + SQLite/Postgres)
bun run db:push      # Push schema
bun run db:studio    # Prisma Studio UI
```

### Adding a New Agent

1. Create `mini-services/research-orchestrator/agents/my_agent.ts`
2. Export async function matching signature: `(input, emit, context) => output`
3. Register in `index.ts` orchestration loop
4. Add UI component in `src/components/orchestrator/`
5. Emit `research:thought` events for live logging

### Adding a New Search Provider

1. Add API key to `settings.ts` provider presets
2. Implement search function in `tools/search.ts`
3. Wire into `discover()` agent pipeline

---

## 🤝 Contributing

We welcome **bug reports, feature requests, code contributions, and research ideas**!

### Ways to Help

| Area | What's Needed |
|------|---------------|
| 🐛 **Bug Fixes** | Socket reconnection edge cases, critique loop termination, plugin sandbox escapes |
| 🔌 **New Providers** | More LLM APIs (Groq, Together, Fireworks), search engines (Brave, Serper), vector DBs (Weaviate, Qdrant) |
| 🧠 **Agent Improvements** | Better planner prompts, critic rubrics, evolution code-gen quality |
| 🎨 **UI/UX** | Accessibility, mobile layout, dark/light theme toggle, export formats (PDF, Notion, Obsidian) |
| 📚 **Docs** | Architecture diagrams, API reference, plugin authoring guide |
| 🧪 **Tests** | Unit tests for agents, integration tests for orchestration loop, E2E with Playwright |

### Development Workflow

1. **Fork** the repo
2. **Create branch**: `git checkout -b feat/amazing-feature`
3. **Make changes** — keep commits atomic, write clear messages
4. **Run checks**: `bun run lint && bun run build` (both root and orchestrator)
5. **Open a PR** — fill the template, link related issues

### Code Style

- **TypeScript strict mode** — no `any` unless absolutely necessary
- **Functional components** + hooks only
- **Zustand** for client state, **Socket.io events** for server sync
- **TailwindCSS 4** utility classes — avoid custom CSS
- **Framer Motion** for animations — respect `prefers-reduced-motion`

---

## 🐛 Reporting Issues

### Before You File
1. **Search existing issues** — duplicates slow everyone down
2. **Check the FAQ** (below)
3. **Try latest `main` branch** — your bug may already be fixed

### Bug Report Template
When opening an issue, please include:

```markdown
## Environment
- OS: [e.g. Windows 11, Ubuntu 24.04, macOS 14]
- Bun version: `bun --version`
- Node version: `node --version`
- Backend: [Local Ollama / OpenRouter / Anthropic / Other]
- Frontend: [localhost:3000 / deployed URL]

## Steps to Reproduce
1. Start orchestrator: `bun run dev` in mini-services/research-orchestrator
2. Start frontend: `bun run dev` in root
3. Enter query: "..."
4. Observe: ...

## Expected vs Actual
- **Expected**: ...
- **Actual**: ...

## Logs
```
Paste relevant orchestrator logs (port 3003 console) and browser console errors here.
```

## Screenshots
If UI-related, attach screenshots or a short screen recording.
```

### Feature Requests
Use the **Feature Request** issue template. Describe:
- The problem you're solving
- Proposed solution / API shape
- Alternatives considered
- Willingness to implement (we'll guide you!)

---

## ❓ FAQ

<details>
<summary><strong>Why Bun instead of Node.js for the backend?</strong></summary>
Bun's native TypeScript execution, faster startup, and built-in `sqlite`/`ws` make the orchestrator lightweight and dependency-free. The frontend stays on Next.js/Node.
</details>

<details>
<summary><strong>Can I run this fully offline?</strong></summary>
Yes — configure **Ollama** as the LLM provider and use a local search API (or disable discovery). The degraded mode compiles reports from cached sources without any LLM calls.
</details>

<details>
<summary><strong>How does the plugin sandbox work?</strong></summary>
Evolution-authored tools are written to `custom_plugins/<name>.py`, compiled with `python3 -m py_compile`, then executed in a subprocess with a 30s timeout. Failed compiles are auto-patched once via LLM before rollback.
</details>

<details>
<summary><strong>What's the difference between "Research" and "Blueprint" task types?</strong></summary>
**Research** → evidence-based conclusion (default). **Blueprint** → actionable design/architecture (triggers Swarm Planner + specialist agents). The Coordinator classifies automatically.
</details>

<details>
<summary><strong>How do I reset the plugin registry?</strong></summary>
Delete `mini-services/research-orchestrator/custom_plugins/registry.json` and restart the orchestrator. Built-in plugins are preserved; only evolved tools are removed.
</details>

---

## 📜 License

**MIT License** — see [LICENSE](LICENSE) for details.

> You're free to use, modify, and distribute this for any purpose, including commercial. Attribution appreciated but not required.

---

## 🙏 Acknowledgments

- **LangGraph** — inspiration for the actor–critic graph architecture
- **AutoGPT / BabyAGI** — pioneered the autonomous agent pattern
- **shadcn/ui** — beautiful, accessible component primitives
- **React Three Fiber / Drei** — the 3D graph would be impossible without you
- **TailwindCSS** — utility-first styling that scales
- **Bun** — for making backend TS a joy
- **All contributors** — every bug report, PR, and idea makes this better

---

## 📞 Get in Touch

- **GitHub Issues** — bugs, features, questions
- **GitHub Discussions** — architecture debates, research ideas, show-and-tell
- **Discord** — *(coming soon)* real-time help & community

---

<div align="center">

### ⭐ If this project helps your research, please star the repo!

It helps others discover it and motivates continued development.

<br>

**Built with curiosity, rigour, and a healthy distrust of single-pass LLMs.**

</div>

---

<!--
  📸 SCREENSHOT PLACEHOLDERS
  ==========================
  Replace these with actual screenshots when available.

  Suggested shots:
  1. Hero — full console at idle (glass UI, pipeline strip, examples)
  2. Live run — graph + streaming log + critic loop active
  3. Final report — markdown output with citations
  4. Plugin registry — evolved tools listed
  5. Settings modal — provider/model configuration
  6. Mobile view — responsive layout

  To add screenshots:
  1. Place images in `/public/screenshots/`
  2. Update the <img> tags below with correct paths
  3. Remove this comment block
-->

<!--
<div align="center">

### Screenshots

<table>
<tr>
<td><img src="/screenshots/1-hero-idle.png" alt="Hero - Idle Console" width="400"></td>
<td><img src="/screenshots/2-live-run.png" alt="Live Run - Graph + Log" width="400"></td>
</tr>
<tr>
<td><img src="/screenshots/3-final-report.png" alt="Final Report" width="400"></td>
<td><img src="/screenshots/4-plugin-registry.png" alt="Plugin Registry" width="400"></td>
</tr>
<tr>
<td><img src="/screenshots/5-settings.png" alt="Settings Modal" width="400"></td>
<td><img src="/screenshots/6-mobile.png" alt="Mobile View" width="400"></td>
</tr>
</table>

</div>
-->