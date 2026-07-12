'use client'

import { useOrchestrator, type Phase } from '@/lib/orchestrator-store'

/**
 * Phase-glow wrapper hook (Step 3).
 *
 * Returns the ambient glow class + border tint when one of `roles` matches
 * the current active agent phase and a run is in progress (or just
 * completed for the 'final' phase). Empty string otherwise.
 *
 * The glow profile (drop-shadow color + border tint) is mapped per phase in
 * globals.css via `.agent-glow-<phase>`. Apply it to a glass container:
 *   <div className={glass-panel-premium ${usePhaseGlow(['discovery'])}}>
 */
export function usePhaseGlow(roles: Phase[]): string {
  const phase = useOrchestrator((s) => s.phase)
  const running = useOrchestrator((s) => s.running)

  if (!running && phase !== 'final') return ''
  if (!roles.includes(phase)) return ''
  return `agent-glow agent-glow-${phase}`
}

/**
 * Single-phase convenience overload matching the blueprint's API shape:
 *   usePhaseGlowFor('discovery')
 */
export function usePhaseGlowFor(targetPhase: Phase): string {
  return usePhaseGlow([targetPhase])
}
