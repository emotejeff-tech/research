/**
 * agents/dreamer.ts — The Dreamer agent.
 *
 * Generates creative hypotheses and "dreams" from the current research
 * synthesis. Uses llmWithFallback so it works with local LLMs.
 * Falls back to a deterministic heuristic mode when the LLM is unavailable.
 */
import { llmWithFallback, extractJSON } from '../tools/llm'
import type { Source, TaskType } from '../types'

const DREAMER_SYSTEM = `You are the Dreamer agent in a multi-agent research system.
Your job is to generate creative, actionable "dreams" — novel hypotheses,
research directions, and speculative insights — based on the evidence gathered.

Rules:
1. Ground dreams in the evidence. Don't invent facts.
2. Be specific and actionable.
3. Suggest 3-5 dreams, each with:
   - name: short descriptive name
   - hypothesis: the core idea
   - rationale: why this makes sense based on the evidence
   - nextStep: what to do next to validate this dream
4. Return ONLY valid JSON array.

Example format:
[
  {
    "name": "Dream Name",
    "hypothesis": "A clear, testable hypothesis",
    "rationale": "Why this follows from the evidence",
    "nextStep": "The concrete next action to validate it"
  }
]`

export interface Dream {
  name: string
  hypothesis: string
  rationale: string
  nextStep: string
}

/** Build the user prompt for the dreamer. */
function buildDreamPrompt(query: string, taskType: TaskType, sources: Source[], draft: string): string {
  const sourcesBlock = sources
    .slice(0, 10)
    .map((s, i) => `[${i + 1}] ${s.title}\n    URL: ${s.url}\n    ${s.snippet}`)
    .join('\n')

  return `Goal: ${query}\nTask type: ${taskType}\n\nCurrent synthesis:\n${draft.slice(0, 4000)}\n\nSources:\n${sourcesBlock}\n\nGenerate 3-5 creative, evidence-grounded dreams for this research direction. Return ONLY the JSON array.`
}

/** Build a deterministic fallback dream when LLM is unavailable. */
function buildFallbackDream(query: string, taskType: TaskType, sources: Source[], draft: string): Dream[] {
  const sourceCount = sources.length
  const draftLength = draft.length
  const dreamCount = sourceCount > 0 ? Math.min(3, sourceCount) : 2

  return [
    {
      name: 'Evidence-Gap Exploration',
      hypothesis: `The current evidence suggests a meaningful gap in ${query.slice(0, 80)} that could be explored further.`,
      rationale: `Based on ${sourceCount} sources and a ${draftLength} character synthesis, the strongest next step is to identify what evidence is missing rather than what is already known.`,
      nextStep: 'Search for conflicting evidence or negative results related to this topic.'
    },
    {
      name: 'Cross-Domain Synthesis',
      hypothesis: 'Applying concepts from a related domain could reveal a novel solution path for this problem.',
      rationale: `The research direction "${query}" intersects with multiple domains. A cross-domain transfer might surface an approach that a single-domain analysis would miss.`,
      nextStep: 'Identify one adjacent field that uses similar techniques and adapt them to this problem.'
    }
  ].slice(0, dreamCount)
}

export async function dream(
  query: string,
  taskType: TaskType,
  sources: Source[],
  draft: string,
): Promise<Dream[]> {
  const prompt = buildDreamPrompt(query, taskType, sources, draft)
  const degraded = JSON.stringify(buildFallbackDream(query, taskType, sources, draft))

  try {
    const result = await llmWithFallback(
      DREAMER_SYSTEM,
      prompt,
      {
        retries: 2,
        degraded,
        complexity: 'heavy',
        useJsonMode: true,
      },
    )

    const parsed = extractJSON<Dream[]>(result.content)
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed
        .filter((d) => d && typeof d.name === 'string' && typeof d.hypothesis === 'string')
        .slice(0, 5)
    }

    // If JSON parsing fails, fall back to heuristic dreams.
    return buildFallbackDream(query, taskType, sources, draft)
  } catch (e) {
    console.warn(`[dreamer] LLM dream generation failed, using fallback: ${(e as Error).message}`)
    return buildFallbackDream(query, taskType, sources, draft)
  }
}
