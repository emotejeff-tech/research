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
Task ID: 15
Agent: orchestrator (main)
Task: Local-first improvements — make the system work better with local LLMs, local memory, local TTS/Audiobox, and local plugin storage instead of Pinecone/Supabase.

Work Log:
- tools/llm.ts: Rewrote the LLM pipeline to be local-first with Ollama/LM Studio/llama.cpp/OpenAI-compatible fallback. Supports:
  - Ollama (local)
  - LM Studio (local)
  - llama.cpp (local)
  - custom OpenAI-compatible endpoints
  - OpenRouter fallback
  - degraded no-LLM mode
- tools/settings.ts: Added local-first memory settings:
  - memoryBackend: 'local'
  - memoryPath: ''
  - empty pineconeApiKey / pineconeIndex fields (safe to ignore)
  - VoiceBox defaults moved to local Kokoro/Audiobox-style presets
- tools/voicebox.ts: Added auto-fetch model/voice support for Audiobox and local TTS presets.
- agents/evolution.ts: Patched llmWithFallback usage to use the newer object option form with retries/deduplication.
- index.ts: Startup now auto-detects local models and fetches available voices/models.
- tools/plugin_registry.ts: Rewritten to be persistent and `INTELLAGENT`-aware.
- tools/plugin_runner.ts: Rewritten for dynamic runtime execution of plugins.
- types.ts: Added plugin source/version metadata.

Stage Summary:
- Local-first improvements are in progress. The system now supports local LLMs, local memory, local TTS, and persistent plugin storage. Need verification on actual local services.

---
Task ID: 16
Agent: orchestrator (main)
Task: Create a separate stylish plugin store webpage with 3D glass floating shadows and animations.

Work Log:
- Created `plugin-store.html` as a standalone webpage with:
  - 3D glassmorphic cards
  - floating animated elements
  - gradient text
  - hover effects
  - plugin cards with ratings and download buttons
- Created `src/app/plugins/page.tsx` as an integrated Next.js page version.

Stage Summary:
- Plugin store webpage is created and ready. Need to verify it renders correctly.

---
Task ID: 17
Agent: orchestrator (main)
Task: Commit and push all current changes to GitHub.

Work Log:
- git add -A
- git commit -m "feat: improve self-evolve with plugin system and demo arxiv tools"
- git push origin main
- Pushed successfully to `https://github.com/emotejeff-tech/research`

Stage Summary:
- All current changes are pushed to GitHub.
