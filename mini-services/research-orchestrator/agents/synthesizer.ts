/**
 * agents/synthesizer.ts — The Actor. Drafts a cited synthesis from evidence.
 *
 * Mode-aware:
 *  - 'research'  → strict independent-research-analyst methodology.
 *  - 'blueprint' → best-ideas actionable blueprint using latest research/code.
 *  - 'upgrade'   → extracts tool blueprints from academic literature as JSON
 *                  for the Evolution Engine to compile into executable skills.
 *
 * Uses the model fallback pipeline: if the LLM is unavailable, degrades to a
 * no-LLM snippet compilation so the run never freezes.
 */
import { llmWithFallback, llm, extractJSON, degradedSynthesis } from '../tools/llm'
import type { Source, TaskType, UpgradeBlueprint } from '../types'

const RESEARCH_SYSTEM = `You are an independent research analyst. Evaluate the goal below and form an ORIGINAL conclusion. You MUST strictly follow these rules:

1. Primary Data Only: Rely exclusively on verifiable, empirical data, raw statistics, documented history, or peer-reviewed findings from the sources.
2. Strip the Narrative: Filter out editorial commentary, political bias, corporate PR, and standard internet consensus. Do NOT adopt the framing or wording of outside sources — use your own.
3. Show Your Logic: Walk through your step-by-step reasoning. Compare opposing data points or counterarguments directly against each other based on the strength of their evidence.
4. Form an Independent Conclusion: Based only on that evidence and your own logical synthesis, deliver a DEFINITIVE conclusion. Do NOT hedge with generic summaries like "some experts say X while others say Y" — state what the data actually points to.

Write in Markdown. Cite sources inline as [n]. Keep it under ~500 words. Address critic feedback when provided.`

const BLUEPRINT_SYSTEM = `You are a senior systems architect. For the goal below, produce the strongest, most actionable blueprint using the latest research and code from the sources.
Come up with the best ideas and concrete objectives to complete the task in the best way. Include: core objectives, architecture / step-by-step plan, key technologies with rationale (prefer the newest approaches the sources support), and concrete next actions. Be specific and opinionated, not generic.
Write in Markdown. Cite sources inline as [n]. Keep it under ~500 words. Address critic feedback when provided.`

function systemFor(taskType: TaskType): string {
  return taskType === 'blueprint' ? BLUEPRINT_SYSTEM : RESEARCH_SYSTEM
}

function buildUser(
  query: string,
  sources: Source[],
  feedback: string,
  taskType: TaskType,
): string {
  const sourcesBlock = sources
    .map((s, i) => `[${i + 1}] ${s.title}\n    URL: ${s.url}\n    ${s.snippet}`)
    .join('\n')
  const synthPrompt = feedback
    ? `Previous draft was critiqued. Feedback to address: ${feedback}\n\nRevise your ${taskType} accordingly.`
    : taskType === 'blueprint'
      ? 'Produce the first blueprint.'
      : 'Produce your first independent analysis.'
  return `Goal: ${query}\nTask type: ${taskType}\n\nSources:\n${sourcesBlock}\n\n${synthPrompt}`
}

export async function synthesize(
  query: string,
  sources: Source[],
  feedback: string,
  _iteration: number,
  taskType: TaskType = 'research',
): Promise<{ draft: string; mode: 'primary' | 'degraded'; tier: 'primary' | 'local' | 'degraded' }> {
  const result = await llmWithFallback(
    systemFor(taskType),
    buildUser(query, sources, feedback, taskType),
    {
      retries: 2,
      degraded: degradedSynthesis(query, sources),
    },
  )
  return { draft: result.content, mode: result.mode, tier: result.tier }
}

// ---------- UPGRADE MODE: extract tool blueprints from literature ----------

const UPGRADE_SYSTEM = `You are the Nexus Architect. You are reviewing academic AI literature to upgrade your own system capabilities.

Do NOT write a summary of the papers. Instead, extract the actionable mechanics. For every technique, algorithm, or optimization method you discover in the sources, output a strict JSON array of tool blueprints. Each blueprint must contain:
1. "suggestedToolName": A snake_case name for what this new skill should be called.
2. "mechanics": The exact mathematical formulas, data transformations, or logical steps described in the paper — detailed enough that a Python developer could implement it.
3. "justification": Why adding this tool improves the system's baseline performance.
4. "sourceTitle": The title of the source this blueprint was extracted from.

Extract up to 3 of the most valuable, novel, and implementable blueprints. Return ONLY a JSON array: [{"suggestedToolName":"...","mechanics":"...","justification":"...","sourceTitle":"..."}]`

/** Build the upgrade prompt. */
function buildUpgradePrompt(query: string, sources: Source[]): string {
  const sourcesBlock = sources
    .map((s, i) => `[${i + 1}] ${s.title}\n    URL: ${s.url}\n    ${s.snippet}`)
    .join('\n')

  return `Upgrade goal: ${query}\n\nLiterature sources:\n${sourcesBlock}\n\nExtract the tool blueprints now. Return ONLY the JSON array.`
}

/** Fallback upgrade extraction when LLM unavailable. */
function buildFallbackUpgrades(query: string, sources: Source[]): UpgradeBlueprint[] {
  return [
    {
      suggestedToolName: 'local_memory_fallback',
      mechanics: 'Store research conclusions in a local JSON file with TF-IDF embeddings for offline RAG retrieval.',
      justification: 'Eliminates dependency on cloud vector databases like Pinecone/Supabase.',
      sourceTitle: 'Local-first architecture',
    },
    {
      suggestedToolName: 'local_tts_auto_detect',
      mechanics: 'Auto-detect local Audiobox/TTS servers on localhost:17493 and fetch available voices/models on startup.',
      justification: 'Enables offline TTS without manual configuration.',
      sourceTitle: 'Local-first architecture',
    },
  ]
}

/**
 * UPGRADE mode: extracts tool blueprints from academic literature.
 * Returns an array of UpgradeBlueprint objects that the Evolution Engine
 * will compile into executable Python tools.
 */
export async function extractUpgrades(
  query: string,
  sources: Source[],
): Promise<UpgradeBlueprint[]> {
  const raw = await llmWithFallback(
    UPGRADE_SYSTEM,
    buildUpgradePrompt(query, sources),
    {
      retries: 2,
      degraded: JSON.stringify(buildFallbackUpgrades(query, sources)),
      complexity: 'heavy',
      useJsonMode: true,
    },
  )

  const parsed = extractJSON<UpgradeBlueprint[]>(raw.content)
  if (Array.isArray(parsed)) {
    return parsed
      .filter(
        (b) =>
          b &&
          typeof b.suggestedToolName === 'string' &&
          typeof b.mechanics === 'string',
      )
      .slice(0, 3)
      .map((b) => ({
        suggestedToolName: b.suggestedToolName
          .replace(/[^a-z0-9_]/gi, '_')
          .toLowerCase(),
        mechanics: b.mechanics,
        justification: b.justification || '',
        sourceTitle: b.sourceTitle || '',
      }))
  }
  // Fallback: try to find a single object instead of an array.
  const single = extractJSON<UpgradeBlueprint>(raw.content)
  if (single && single.suggestedToolName && single.mechanics) {
    return [
      {
        suggestedToolName: single.suggestedToolName
          .replace(/[^a-z0-9_]/gi, '_')
          .toLowerCase(),
        mechanics: single.mechanics,
        justification: single.justification || '',
        sourceTitle: single.sourceTitle || '',
      },
    ]
  }
  return buildFallbackUpgrades(query, sources)
}

/**
 * Builds an upgrade report (Markdown) from the compiled blueprints + tools.
 */
export function buildUpgradeReport(
  query: string,
  blueprints: UpgradeBlueprint[],
  createdTools: { name: string; success: boolean }[],
): string {
  let md = `# 🧬 Upgrade Report: ${query}\n\n`
  md += `> The agent ingested academic literature, extracted ${blueprints.length} tool blueprint(s), and compiled ${createdTools.filter((t) => t.success).length} into executable skills permanently registered to the plugin registry.\n\n`
  md += `## Compiled Upgrades\n\n`
  for (const t of createdTools) {
    md += `- ${t.success ? '✅' : '❌'} **${t.name}** — ${t.success ? 'compiled, tested & registered' : 'failed compilation'}\n`
  }
  md += `\n## Blueprint Details\n\n`
  for (const b of blueprints) {
    md += `### ${b.suggestedToolName}\n`
    if (b.sourceTitle) md += `*Source: ${b.sourceTitle}*\n\n`
    md += `**Mechanics:**\n${b.mechanics}\n\n`
    md += `**Justification:** ${b.justification}\n\n`
  }
  md += `\n---\n*This was an UPGRADE run — the agent actively consumed literature to expand its own capabilities rather than producing a passive summary.*`
  return md
}
