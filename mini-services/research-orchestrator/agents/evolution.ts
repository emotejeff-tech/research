/**
 * agents/evolution.ts — The Self-Teaching Loop (Evolution Engine).
 *
 *   1. Gap Analysis Agent     — detects a specific missing capability from
 *                               the live research context.
 *   2. Tool Authoring Agent   — writes clean, sandboxed Python with a main()
 *                               entry point, stdlib only.
 *   3. Automated Test Sandbox — python3 -m py_compile validates syntax in an
 *                               isolated process; on failure the error is fed
 *                               back to the author for one patch attempt.
 *   4. Skill Registry         — persisted to custom_plugins/ on disk so the
 *                               tool survives restarts and can be hot-swapped
 *                               into the runtime toolkit.
 *
 * Self-correction: if the generated code fails compilation, the stack trace is
 * fed back to the Tool Authoring Agent which rewrites the file. One patch
 * attempt; if it still fails, the file is rolled back (deleted) and the tool
 * is not registered.
 */
import { execSync } from 'child_process'
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { llm, extractJSON } from '../tools/llm'
import type { Plugin, Source } from '../types'
import { uid } from '../util'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const PLUGIN_DIR = join(__dirname, '..', 'custom_plugins')

// ---------- Prompts ----------
const GAP_SYSTEM =
  'You are the Gap Analysis agent in a self-teaching research system. Given the research goal, the gathered sources, and the system\'s existing tool registry, identify ONE specific, concrete capability the system lacks that would genuinely improve future runs of this kind. Be precise — name the exact data extraction, parsing, validation, or analysis task. Return ONLY JSON: {"capability":"one sentence naming the missing capability","rationale":"why this matters for this research domain"}.'

const AUTHOR_SYSTEM =
  'You are the Tool Authoring agent (Evolution Engine). Given a missing capability, write a self-contained, secure, optimized Python script that performs exactly that function. HARD RULES: (1) standard library only — no pip installs; (2) must include a `def main():` entry point and a `if __name__ == "__main__": main()` guard; (3) under ~45 lines; (4) must accept a CLI arg (sys.argv[1]) as input and print results to stdout; (5) handle errors gracefully with try/except — never crash. Return ONLY JSON: {"name":"snake_case_name","description":"one line","language":"python","code":"the full python source with \\n escapes"}.'

const PATCH_SYSTEM =
  'You are the Tool Authoring agent fixing a generated Python tool that failed its sandbox test. Given the code and the compilation error, rewrite the ENTIRE corrected script following the same rules (stdlib only, main() entry point, CLI arg, graceful error handling). Return ONLY JSON: {"name":"snake_case_name","description":"one line","language":"python","code":"the full corrected python source with \\n escapes"}.'

// ---------- Stage 1: Gap Analysis ----------
export async function analyzeGap(
  query: string,
  sources: Source[],
  subQueries: string[],
  existingTools: string[],
): Promise<{ capability: string; rationale: string }> {
  const sourcesDigest = sources
    .slice(0, 8)
    .map((s, i) => `[${i + 1}] ${s.title} (${s.host})`)
    .join('\n')
  const raw = await llm(
    GAP_SYSTEM,
    `Research goal: ${query}\nSub-queries explored: ${subQueries.join('; ')}\nSources gathered:\n${sourcesDigest}\nExisting tools in registry: ${existingTools.length ? existingTools.join(', ') : 'none'}\n\nIdentify the single most valuable missing capability.`,
  )
  const parsed = extractJSON<{ capability?: string; rationale?: string }>(raw)
  return {
    capability: parsed?.capability || 'a reusable data-extraction utility for this domain',
    rationale: parsed?.rationale || 'would automate part of the research workflow',
  }
}

// ---------- Stage 2: Tool Authoring ----------
function parsePlugin(raw: string): Omit<Plugin, 'id' | 'createdAt'> | null {
  const parsed = extractJSON<{
    name?: string
    description?: string
    language?: string
    code?: string
  }>(raw)
  if (!parsed || !parsed.name || !parsed.code) return null
  // un-escape newlines if the LLM returned them as literal \n
  const code = parsed.code.replace(/\\n/g, '\n').replace(/\\t/g, '\t')
  const name = parsed.name.replace(/[^a-z0-9_]/gi, '_').toLowerCase()
  return {
    name,
    description: parsed.description || '',
    language: parsed.language || 'python',
    code,
  }
}

export async function authorTool(
  capability: string,
  query: string,
): Promise<Omit<Plugin, 'id' | 'createdAt'> | null> {
  const raw = await llm(
    AUTHOR_SYSTEM,
    `Missing capability to fulfill: ${capability}\nResearch context: ${query}\n\nGenerate the Python tool now.`,
  )
  return parsePlugin(raw)
}

// ---------- Stage 3: Automated Test Sandbox ----------
/**
 * Writes the code to custom_plugins/<name>.py and validates it with
 * `python3 -m py_compile`. Returns the compile error (if any) so the
 * caller can feed it back for patching.
 */
export function testTool(
  name: string,
  code: string,
): { passed: boolean; error?: string } {
  if (!existsSync(PLUGIN_DIR)) mkdirSync(PLUGIN_DIR, { recursive: true })
  const filePath = join(PLUGIN_DIR, `${name}.py`)
  writeFileSync(filePath, code, 'utf-8')
  try {
    execSync(`python3 -m py_compile ${JSON.stringify(filePath)}`, {
      timeout: 8000,
      stdio: 'pipe',
    })
    return { passed: true }
  } catch (e: any) {
    const stderr = e.stderr?.toString() || e.message || 'unknown compile error'
    return { passed: false, error: stderr.slice(0, 400) }
  }
}

/** Remove a failed tool from disk (rollback). */
export function rollbackTool(name: string) {
  const filePath = join(PLUGIN_DIR, `${name}.py`)
  try {
    if (existsSync(filePath)) unlinkSync(filePath)
  } catch {
    /* ignore */
  }
}

// ---------- Self-correction: patch a failed tool ----------
export async function patchTool(
  name: string,
  code: string,
  error: string,
  capability: string,
): Promise<Omit<Plugin, 'id' | 'createdAt'> | null> {
  const raw = await llm(
    PATCH_SYSTEM,
    `Missing capability: ${capability}\n\nFailed code:\n${code}\n\nCompilation/test error:\n${error}\n\nRewrite the ENTIRE corrected script.`,
  )
  const patched = parsePlugin(raw)
  // keep the original name so we overwrite the same file
  if (patched) patched.name = name
  return patched
}

// ---------- Stage 4: Full Evolution Loop ----------
export interface EvolutionResult {
  plugin: Plugin | null
  gap: { capability: string; rationale: string }
  testStatus: 'passed' | 'failed' | 'patched'
  testError?: string
}

/**
 * Orchestrates the full Self-Teaching Loop:
 *   gap analysis → author → test → (patch if fail) → register
 * Emits progress via the provided callback.
 */
export async function evolve(
  query: string,
  sources: Source[],
  subQueries: string[],
  existingTools: string[],
  onStage: (stage: string, detail?: any) => void,
): Promise<EvolutionResult> {
  // Stage 1 — Gap Analysis
  onStage('gap')
  const gap = await analyzeGap(query, sources, subQueries, existingTools)
  onStage('gap_done', gap)

  // Stage 2 — Tool Authoring
  onStage('author', { capability: gap.capability })
  let tool = await authorTool(gap.capability, query)
  if (!tool) {
    onStage('author_failed')
    return { plugin: null, gap, testStatus: 'failed', testError: 'authoring returned unparseable output' }
  }

  // Stage 3 — Test Sandbox
  onStage('test', { name: tool.name })
  let test = testTool(tool.name, tool.code)
  let testStatus: 'passed' | 'failed' | 'patched' = test.passed ? 'passed' : 'failed'

  // Self-correction: if compilation failed, patch once.
  if (!test.passed) {
    onStage('patch', { name: tool.name, error: test.error })
    const patched = await patchTool(tool.name, tool.code, test.error || '', gap.capability)
    if (patched) {
      tool = patched
      const retest = testTool(tool.name, tool.code)
      if (retest.passed) {
        testStatus = 'patched'
        test = retest
      } else {
        // still failing — rollback
        rollbackTool(tool.name)
        onStage('test_failed', { error: retest.error })
        return {
          plugin: null,
          gap,
          testStatus: 'failed',
          testError: retest.error,
        }
      }
    } else {
      rollbackTool(tool.name)
      onStage('test_failed', { error: test.error })
      return { plugin: null, gap, testStatus: 'failed', testError: test.error }
    }
  }

  // Stage 4 — Register (on disk + in-memory object)
  onStage('register', { name: tool.name })
  const plugin: Plugin = {
    id: uid(),
    name: tool.name,
    description: tool.description,
    language: tool.language,
    code: tool.code,
    createdAt: Date.now(),
    gapAnalysis: gap.capability,
    testStatus,
    testError: test.error,
    patched: testStatus === 'patched',
    executionStatus: 'not_run',
  }
  onStage('done', { plugin })
  return { plugin, gap, testStatus, testError: test.error }
}
