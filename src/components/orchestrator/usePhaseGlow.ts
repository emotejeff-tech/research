'use client'

import { useOrchestrator, type Phase } from '@/lib/orchestrator-store'

/**
 * Returns the ambient glow class (Step 3) when one of `roles` matches the
 * current active agent phase and a run is in progress (or just completed
 * for the 'final' phase). Empty string otherwise.
 */
export function usePhaseGlow(roles: Phase[]): string {
  const phase = useOrchestrator((s) => s.phase)
  const running = useOrchestrator((s) => s.running)

  if (!running && phase !== 'final') return ''
  if (!roles.includes(phase)) return ''
  return `agent-glow agent-glow-${phase}`
}
