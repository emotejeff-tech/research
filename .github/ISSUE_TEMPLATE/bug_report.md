---
name: Bug Report
about: Report a crash, hang, incorrect behavior, or regression
title: "[BUG] "
labels: ["bug", "needs-triage"]
assignees: ""
---

## Summary
A clear, one-sentence description of the bug.

## Environment
| Detail | Value |
|--------|-------|
| OS | e.g. Windows 11, Ubuntu 24.04, macOS 14 |
| Bun Version | `bun --version` |
| Node Version | `node --version` |
| Frontend Port | 3000 (default) |
| Orchestrator Port | 3003 (default) |
| LLM Provider(s) | OpenRouter / Ollama / LM Studio / etc. |
| Routing Mode | Primary / Degraded / Local |

## Steps to Reproduce
1. Start backend: `cd mini-services/research-orchestrator && bun run dev`
2. Start frontend: `bun run dev`
3. Open http://localhost:3000
4. Enter query: `"Your exact query here"`
5. Click **Launch Research**
6. Observe...

## Expected Behavior
What should have happened?

## Actual Behavior
What actually happened? Include:
- Error messages (full stack traces)
- Console logs (browser DevTools → Console)
- Orchestrator terminal output
- Screenshots or screen recording

## Minimal Reproduction
If possible, provide:
- Smallest query that triggers the bug
- Whether it happens in `degraded` mode too
- Whether it happens with a specific provider

## Additional Context
- Related issues/PRs?
- Recent changes that might have caused this?
- Workarounds you've tried?

---

**Checklist before submitting:**
- [ ] Searched existing issues (open + closed)
- [ ] Reproduced on latest `main` branch
- [ ] Included all environment details above
- [ ] Attached relevant logs/screenshots