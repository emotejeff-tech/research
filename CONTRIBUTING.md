# Contributing to Research Orchestrator

Thank you for your interest in contributing! This guide will help you get started.

## Table of Contents
- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Code Standards](#code-standards)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Review Process](#review-process)
- [Architecture Overview](#architecture-overview)
- [Common Tasks](#common-tasks)

---

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). By participating, you agree to uphold this code.

**TL;DR**: Be respectful, inclusive, and constructive. Harassment, discrimination, and toxic behavior are not tolerated.

---

## Getting Started

### Prerequisites
- **Bun** ≥ 1.0 (`curl -fsSL https://bun.sh/install \| bash`)
- **Node.js** ≥ 20 (for Next.js frontend)
- **Git** (obviously)
- **API Keys** for at least one LLM provider + one search provider (or run in degraded mode)

### First-Time Setup

```bash
# 1. Fork the repo on GitHub, then clone your fork
git clone https://github.com/YOUR-USERNAME/research.git
cd research

# 2. Add upstream remote
git remote add upstream https://github.com/emotejeff-tech/research.git

# 3. Install dependencies (both root and orchestrator)
bun install
cd mini-services/research-orchestrator && bun install && cd ../..

# 4. Copy environment template
cp .env.example .env.local  # (create this file with your keys)
# Edit .env.local with your API keys

# 5. Start development servers
# Terminal 1: Backend
cd mini-services/research-orchestrator && bun run dev

# Terminal 2: Frontend
cd ../.. && bun run dev

# Windows all-in-one alternative:
# powershell -ExecutionPolicy Bypass -File start.ps1

# 6. Open http://localhost:3000
```

### Running in Degraded Mode (No API Keys)
```bash
# The orchestrator will auto-detect missing keys and run in degraded mode
# You can test the full pipeline without any LLM calls
```

---

## Development Workflow

### Branch Strategy
- `main` — Protected, always deployable
- Feature branches: `feat/short-description` (from `main`)
- Bug fixes: `fix/short-description` (from `main`)
- Docs: `docs/short-description`
- Refactors: `refactor/short-description`

### Commit Messages
Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add swarm planner for blueprint tasks
fix: resolve socket reconnection race condition
docs: update README with voice I/O instructions
refactor: extract critic prompt to separate file
test: add unit tests for hypothesis engine
chore: update bun to 1.1.20
```

**Subject line**: lowercase, imperative, ≤ 72 chars
**Body** (optional): explains *why*, not *what*
**Footer** (optional): `Fixes #123`, `Closes #456`

### Keeping Your Branch Updated
```bash
git fetch upstream
git rebase upstream/main
# Resolve conflicts if any
git push --force-with-lease origin your-branch
```

---

## Code Standards

### TypeScript
- **Strict mode** enabled — no `any`, no implicit `any`
- Prefer `interface` over `type` for object shapes
- Use `const` assertions for literal types
- Discriminated unions for state machines (`Phase`, `RoutingMode`, etc.)

```ts
// ✅ Good
export type Phase = 'idle' | 'planning' | 'discovery' | 'synthesis' | 'critique' | 'reflection' | 'generation' | 'final' | 'error';

// ❌ Bad
export type Phase = string;
```

### React / Next.js
- **Server Components** by default, `'use client'` only when needed (hooks, browser APIs)
- **Zustand** for client state — no Redux, Context for props drilling only
- **TailwindCSS 4** — utility classes, avoid custom CSS
- **Framer Motion** for animations — respect `prefers-reduced-motion`
- **Lucide React** for icons — consistent sizing (`h-4 w-4`, `h-5 w-5`)

### Backend (Bun + Socket.io)
- Pure TypeScript, no decorators
- Emit typed events via `Emit` helper
- Handle errors gracefully — never crash the event loop
- Log with structured `emit('research:thought', ...)` for UI sync

### File Organization
```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API routes (TTS, STT, health)
│   ├── page.tsx           # Main console
│   └── layout.tsx
├── components/
│   ├── orchestrator/      # Research-specific UI (20+ components)
│   └── ui/                # shadcn/ui primitives
├── hooks/                 # Custom hooks
├── lib/
│   ├── orchestrator-store.ts  # Zustand + Socket.io client
│   └── utils.ts
mini-services/research-orchestrator/
├── agents/                # 9 agent implementations
├── tools/                 # Capabilities (search, plugins, memory, etc.)
├── custom_plugins/        # Auto-generated tools (gitignored)
├── index.ts               # Socket.io server + orchestration loop
└── types.ts               # Shared types
```

---

## Testing

### Current State
Tests are **minimal** — this is a priority area for contribution.

### Running Tests
```bash
# Frontend
bun run test           # (not yet configured)
bun run test:e2e       # Playwright (not yet configured)

# Backend
cd mini-services/research-orchestrator
bun run test           # (not yet configured)
```

### What We Need
- Unit tests for agents (`planner`, `critic`, `evolution`, `hypothesis_engine`)
- Integration tests for orchestration loop
- E2E tests for critical user flows (launch → complete)
- Contract tests for Socket.io events

---

## Submitting Changes

### Before Opening a PR
1. **Sync with `main`**: `git fetch upstream && git rebase upstream/main`
2. **Run checks**:
   ```bash
   # Root
   bun run lint
   bun run build

   # Orchestrator
   cd mini-services/research-orchestrator
   bun run lint  # if configured
   ```
3. **Test manually**: Run a full research query end-to-end
4. **Update docs**: README, inline comments, TYPEDEFS if APIs changed

### PR Template
Fill out the [PR template](.github/PULL_REQUEST_TEMPLATE.md) completely:
- Description & motivation
- Type of change
- Related issues
- Testing performed
- Screenshots (for UI changes)
- Breaking changes checklist

### PR Title Format
```
feat(orchestrator): add saboteur adversarial testing agent
fix(frontend): resolve graph glow memory leak
docs: add plugin authoring guide
```

---

## Review Process

### What Reviewers Check
1. **Correctness** — Does it solve the stated problem?
2. **Architecture fit** — Consistent with existing patterns?
3. **Type safety** — No `any`, proper discriminated unions
4. **Performance** — No obvious regressions (bundle size, render loops)
5. **Accessibility** — Semantic HTML, keyboard nav, color contrast
6. **Tests** — New code has tests; existing tests pass
7. **Documentation** — Updated for user-facing changes

### Timeline
- First review within **2 business days**
- Follow-up reviews within **1 business day**
- PRs with **3+ approvals** and **green CI** can be merged by any maintainer

### Merge Requirements
- [ ] All CI checks pass
- [ ] At least 1 approval from maintainer
- [ ] No unresolved review comments
- [ ] Branch up to date with `main`
- [ ] Linear history (rebase, no merge commits)

---

## Architecture Overview

### Agent Pipeline
```
User Query
    │
    ▼
┌──────────────────────────────────────────┐
│ COORDINATOR (Planner)                    │
│ • Decomposes query → sub-queries (DAG)   │
│ • Classifies taskType: research/blueprint│
│ • (Optional) Swarm Planner for blueprints│
│ • (Optional) Hypothesis Engine           │
└────────────────────┬─────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────┐
│ DISCOVERY (Researcher)                   │
│ • Parallel web search per sub-query      │
│ • Cache check (search_cache.json)        │
│ • RAG retrieval (vector memory)          │
│ • (Optional) Saboteur injection          │
└────────────────────┬─────────────────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │  ACTOR–CRITIC LOOP     │
        │  (max 3 iterations)    │
        └───────────┬────────────┘
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
┌───────────────┐       ┌───────────────┐
│  SYNTHESIS    │       │   CRITIC      │
│  (Actor)      │◄──────│  (Verifier)   │
│  • Drafts     │       │  • Finds flaws│
│  • Cites      │       │  • PASS/REVISE│
└───────────────┘       └───────────────┘
        │                       │
        └───────────┬───────────┘
                    │
                    ▼
         ┌────────────────────┐
         │  EVOLUTION         │
         │  • Gap analysis    │
         │  • Authors tool    │
         │  • Sandbox tests   │
         │  • Registers plugin│
         └────────┬───────────┘
                  │
                  ▼
         ┌────────────────────┐
         │  DREAMER           │
         │  • Best outcome    │
         │  • New goals       │
         │  • Possibilities   │
         │  • Relevant papers │
         └────────┬───────────┘
                  │
                  ▼
         ┌────────────────────┐
         │  OPSEC AUDIT       │
         │  • PII scrub       │
         │  • UA rotation     │
         └────────┬───────────┘
                  │
                  ▼
         ┌────────────────────┐
         │  FINAL REPORT      │
         │  • Markdown        │
         │  • Full provenance │
         │  • Telemetry       │
         └────────────────────┘
```

### Key Data Structures
- **`TaskState`** — Complete execution snapshot (in `types.ts`)
- **`Plugin`** — Self-taught tool with code, metadata, test status
- **`CritiqueRound`** — Iteration verdict + issues
- **`RunLog`** — Telemetry per completed run

### Real-Time Sync
- **Socket.io** on port 3003
- Events: `research:phase`, `research:thought`, `research:source`, `research:critique`, `research:plugin`, `research:final`, `research:routing`, `stats:update`, `health:update`, `voice:announce`
- Client (`orchestrator-store.ts`) mirrors server state via Zustand

---

## Common Tasks

### Add a New LLM Provider
1. Add preset to `mini-services/research-orchestrator/tools/settings.ts` → `PROVIDER_PRESETS`
2. Implement `fetchModels()` in same file
3. Update `health_check.ts` to ping new provider
4. Frontend: Settings modal auto-detects presets

### Add a New Search Provider
1. Add API key to `settings.ts` presets
2. Implement search function in `tools/search.ts` (or new file)
3. Wire into `discover()` agent in `agents/researcher.ts`
4. Add health check

### Add a New Agent Phase
1. Create `agents/my_agent.ts` with exported async function
2. Define input/output types in `types.ts`
3. Add phase to `index.ts` orchestration loop
4. Emit `research:phase` + `research:thought` events
5. Add UI component in `src/components/orchestrator/`
6. Wire into `page.tsx` pipeline sections

### Create a Custom Plugin (Manual)
1. Write Python file in `custom_plugins/my_tool.py`:
   ```python
   def run(arg: str) -> str:
       return f"Result for {arg}"
   ```
2. Register via orchestrator API or restart (auto-loaded from `registry.json`)
3. Evolution agent will discover and test it

### Debug Socket.io Issues
```bash
# Server logs
DEBUG=socket.io* bun run dev

# Client: open DevTools → Network → WS → filter "socket.io"
# Check: connect, disconnect, reconnect, event payloads
```

### Profile Performance
```bash
# Frontend
bun run build && npx @next/bundle-analyzer

# Backend
bun --inspect index.ts  # Connect Chrome DevTools
```

---

## Getting Help

- **GitHub Discussions** — Architecture questions, research ideas, show-and-tell
- **GitHub Issues** — Bugs, feature requests (use templates)
- **Discord** — *(Coming soon)* Real-time help

---

## Recognition

Contributors are recognized in:
- `CONTRIBUTORS.md` (auto-generated from git)
- Release notes
- README acknowledgments

---

**Thank you for making Research Orchestrator better!** 🚀