/**
 * agents/principles.ts — Experience Distillation for Self-Evolving Agents
 *
 * Follows EvolveR (2510.16079) pattern: offline self-distillation of
 * trajectories into strategic principles, used for online guidance.
 */

import { existsSync, mkdirSync, writeFileSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { llmWithFallback, extractJSON } from '../tools/llm'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const PRINCIPLES_PATH = join(__dirname, '..', 'custom_plugins', 'principles')

const DISTILLER_SYSTEM =
  'You are the Experience Distiller in a self-evolving agent system. Given a successful tool creation, extract ONE strategic principle that could guide future similar tasks. Return ONLY JSON: {"principle":"a concise, actionable insight about tool design or gap identification","pattern":"the pattern this applies to (e.g., data extraction, web scraping)","context":"when this principle is most useful"}.'

/**
 * Distills strategic principles from successful evolutions.
 */
export async function distillPrinciple(
  query: string,
  capability: string,
  toolName: string,
  successMode: 'passed' | 'patched',
): Promise<{ principle: string; pattern: string; context: string } | null> {
  // Wrap in timeout so distillation doesn't block the evolution flow
  try {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Distillation timeout')), 3000),
    )
    const raw = await Promise.race([
      llmWithFallback(
        DISTILLER_SYSTEM,
        `Research goal: ${query}\nGap identified: ${capability}\nTool created: ${toolName}\nSuccess mode: ${successMode}\n\nDistill one strategic principle for future similar tasks.`,
        {
          retries: 0,
          degraded: JSON.stringify({
            principle: 'Focus on stdlib-only implementations for reliability',
            pattern: 'tool authoring',
            context: 'when cloud dependencies are unreliable',
          }),
          complexity: 'simple',
          useJsonMode: true,
        },
      ),
      timeoutPromise,
    ]) as Awaited<ReturnType<typeof llmWithFallback>>

    const parsed = extractJSON<{ principle?: string; pattern?: string; context?: string }>(raw.content)
    if (!parsed?.principle) return null

    // Persist principle to archive
    if (!existsSync(PRINCIPLES_PATH)) mkdirSync(PRINCIPLES_PATH, { recursive: true })
    const principleEntry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      principle: parsed.principle,
      pattern: parsed.pattern || 'general',
      context: parsed.context || 'any',
      createdAt: Date.now(),
      fromTool: toolName,
      fromQuery: query,
    }
    try {
      writeFileSync(
        join(PRINCIPLES_PATH, `${toolName}_${principleEntry.id}.json`),
        JSON.stringify(principleEntry, null, 2),
        'utf-8',
      )
    } catch (e) {
      console.warn('[principles] could not persist principle:', (e as Error).message)
    }

    return {
      principle: parsed.principle!,
      pattern: parsed.pattern || 'general',
      context: parsed.context || 'any',
    }
  } catch (e) {
    // Silently skip distillation on timeout or error
    console.warn('[principles] distillation skipped:', (e as Error).message)
    return null
  }
}

/**
 * Load strategic principles for a given pattern/context.
 */
export function loadRelevantPrinciples(
  patternHint?: string,
  contextHint?: string,
): { principle: string; pattern: string; context: string; fromTool: string }[] {
  if (!existsSync(PRINCIPLES_PATH)) return []

  try {
    const files = readdirSync(PRINCIPLES_PATH).filter((f: string) => f.endsWith('.json'))
    return files
      .map((f: string) => {
        try {
          const data = JSON.parse(readFileSync(join(PRINCIPLES_PATH, f), 'utf-8'))
          return data
        } catch { return null }
      })
      .filter(Boolean)
      .filter((p: any) => {
        if (!patternHint && !contextHint) return true
        return (patternHint && p.pattern === patternHint) ||
               (contextHint && p.context === contextHint)
      })
      .sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 10)
  } catch {
    return []
  }
}