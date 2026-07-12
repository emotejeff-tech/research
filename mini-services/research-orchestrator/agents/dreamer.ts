/**
 * agents/dreamer.ts — The Dreamer.
 *
 * After the Actor-Critic loop converges, the Dreamer reflects deeply on ALL
 * the data and dreams on the possibilities: what's the best possible outcome?
 * What new goals or ideas does the evidence suggest? What relevant papers
 * could advance the blueprint? It searches for those papers live.
 *
 * This is the "dream on the possibilities" stage — the agent lets its
 * imagination roam beyond strict synthesis to discover better ideas, options,
 * and forward-looking directions grounded in the evidence.
 */
import { llm, extractJSON } from '../tools/llm'
import { webSearch } from '../tools/web_search'
import type { Source, Dream, TaskType } from '../types'

const DREAMER_SYSTEM = `You are the Dreamer agent — a visionary research strategist. Given the research goal, the final synthesis, and all gathered sources, you must DREAM on the possibilities and dig deep for the best possible outcomes.

Reflect on ALL the data. Let your imagination roam to discover better ideas, options, and directions the evidence points toward. Then:

1. **Best Possible Outcome**: What is the most optimistic yet evidence-grounded outcome this research could lead to? Dream big but stay tethered to the data.
2. **New Goals**: What new goals or research directions does this open up? What should be investigated next?
3. **Possibilities**: What speculative but plausible possibilities emerge? What could this enable that nobody has tried yet?
4. **Papers**: What academic papers or technical references would advance this blueprint? Name specific paper topics/titles that exist or should exist.
5. **Reflection**: A synthesis of your dreaming — what did the data + dreams reveal when you reflected on everything together?

Return ONLY valid JSON:
{"bestOutcome":"...","newGoals":["...","..."],"possibilities":["...","..."],"papers":[{"title":"...","relevance":"..."}],"reflection":"..."}`

export async function dream(
  query: string,
  synthesis: string,
  sources: Source[],
  taskType: TaskType,
): Promise<Dream | null> {
  const sourcesDigest = sources
    .slice(0, 10)
    .map((s, i) => `[${i + 1}] ${s.title} (${s.host}) — ${s.snippet.slice(0, 120)}`)
    .join('\n')

  const raw = await llm(
    DREAMER_SYSTEM,
    `Research goal: ${query}\nTask type: ${taskType}\n\nFinal synthesis:\n${synthesis}\n\nSources gathered:\n${sourcesDigest}\n\nDream deeply. Reflect on everything. Return the JSON.`,
  )

  const parsed = extractJSON<{
    bestOutcome?: string
    newGoals?: string[]
    possibilities?: string[]
    papers?: { title?: string; relevance?: string }[]
    reflection?: string
  }>(raw)

  if (!parsed) return null

  // Search the web for the top paper topic to enrich with real references.
  let enrichedPapers = (parsed.papers || [])
    .filter((p) => p.title)
    .map((p) => ({ title: p.title!, relevance: p.relevance || '' }))

  if (enrichedPapers.length > 0 && enrichedPapers.length < 4) {
    try {
      const results = await webSearch(`academic paper ${enrichedPapers[0].title}`, 3)
      for (const r of results.slice(0, 2)) {
        enrichedPapers.push({
          title: r.title,
          relevance: `Live result: ${r.host} — ${r.snippet.slice(0, 80)}`,
        })
      }
    } catch {
      /* search is best-effort */
    }
  }

  return {
    bestOutcome: parsed.bestOutcome || '',
    newGoals: Array.isArray(parsed.newGoals) ? parsed.newGoals : [],
    possibilities: Array.isArray(parsed.possibilities) ? parsed.possibilities : [],
    papers: enrichedPapers,
    reflection: parsed.reflection || '',
  }
}
