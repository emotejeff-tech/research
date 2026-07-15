---
name: Pull Request
about: Submit code changes for review
title: ""
labels: []
assignees: ""
---

## Description
Brief summary of what this PR does and why.

## Type of Change
- [ ] Bug fix (non-breaking change fixing an issue)
- [ ] New feature (non-breaking change adding functionality)
- [ ] Breaking change (fix or feature that changes existing behavior)
- [ ] Documentation update
- [ ] Refactoring (no functional changes)
- [ ] Performance improvement
- [ ] Test addition/improvement
- [ ] Dependency update
- [ ] CI/CD change

## Related Issues
Fixes #(issue number)
Relates to #(issue number)

## Changes Made
### Backend (mini-services/research-orchestrator)
- [ ] New agent: `agents/xxx.ts`
- [ ] New tool: `tools/xxx.ts`
- [ ] Modified: `index.ts` (orchestration)
- [ ] Modified: `types.ts` (types)
- [ ] Modified: `settings.ts` (provider config)
- [ ] Other: _______

### Frontend (src/)
- [ ] New component: `components/orchestrator/xxx.tsx`
- [ ] Modified: `components/orchestrator/xxx.tsx`
- [ ] Modified: `lib/orchestrator-store.ts` (state)
- [ ] Modified: `app/page.tsx` (layout)
- [ ] Modified: `app/globals.css` (styles)
- [ ] Other: _______

## Testing Performed
- [ ] `bun run lint` passes (root)
- [ ] `bun run build` passes (root)
- [ ] Orchestrator starts without errors: `cd mini-services/research-orchestrator && bun run dev`
- [ ] Manual test: Ran a research query end-to-end
- [ ] Tested in degraded mode (no API keys)
- [ ] Tested with provider: _______
- [ ] Mobile viewport checked (≤640px)
- [ ] Accessibility: keyboard navigation, aria labels

## Screenshots / Recordings
| Before | After |
|--------|-------|
| ![before](url) | ![after](url) |

## Breaking Changes
If this PR introduces breaking changes, describe:
- What changes
- Migration path for users
- Version bump needed (major/minor)

## Checklist
- [ ] Code follows project style (TypeScript strict, no `any`)
- [ ] Self-review completed
- [ ] Comments added for complex logic
- [ ] Documentation updated (README, CONTRIBUTING, inline comments)
- [ ] No console.log / debugger left in code
- [ ] Commits follow Conventional Commits format
- [ ] Branch is up to date with `main`
- [ ] CI checks pass (or will pass after review)

## Additional Notes
Anything else reviewers should know? Deployment notes? Rollback plan?