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
 *   5. Experience Distillation — extracts strategic principles from successful
 *                               evolutions for future guidance (EvolveR-style).
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
import { llmWithFallback, extractJSON } from '../tools/llm'
import type { Plugin, Source } from '../types'
import { uid } from '../util'
import { validatePlugin } from '../tools/plugin_runner'

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
  const raw = await llmWithFallback(
    GAP_SYSTEM,
    `Research goal: ${query}\nSub-queries explored: ${subQueries.join('; ')}\nSources gathered:\n${sourcesDigest}\nExisting tools in registry: ${existingTools.length ? existingTools.join(', ') : 'none'}\n\nIdentify the single most valuable missing capability.`,
    {
      retries: 2,
      degraded: JSON.stringify({
        capability: 'a reusable data-extraction utility for this domain',
        rationale: 'would automate part of the research workflow',
      }),
      complexity: 'standard',
      useJsonMode: true,
    },
  )
  const parsed = extractJSON<{ capability?: string; rationale?: string }>(raw.content)
  return {
    capability: parsed?.capability || 'a reusable data-extraction utility for this domain',
    rationale: parsed?.rationale || 'would automate part of the research workflow',
  }
}

// ---------- Stage 2: Tool Authoring ----------
function parsePlugin(raw: { content: string } | string): Omit<Plugin, 'id' | 'createdAt'> | null {
  const text = typeof raw === 'string' ? raw : raw.content
  const parsed = extractJSON<{
    name?: string
    description?: string
    language?: string
    code?: string
  }>(text)
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
  const raw = await llmWithFallback(
    AUTHOR_SYSTEM,
    `Missing capability to fulfill: ${capability}\nResearch context: ${query}\n\nGenerate the Python tool now.`,
    {
      retries: 2,
      degraded: JSON.stringify({
        name: 'fallback_tool',
        description: 'fallback tool generated when LLM is unavailable',
        language: 'python',
        code: '# fallback tool\n\ndef main():\n    print("fallback tool unavailable")\n\nif __name__ == "__main__":\n    main()\n',
      }),
      complexity: 'standard',
      useJsonMode: true,
    },
  )
  return parsePlugin(raw.content)
}

/**
 * UPGRADE mode: authors a tool directly from a blueprint's mechanics.
 * The suggestedToolName is used as the tool name; the mechanics provide the
 * exact algorithm/formula to implement. Bypasses gap analysis since the
 * blueprint already identifies the capability.
 */
export async function authorFromBlueprint(
  suggestedName: string,
  mechanics: string,
  justification: string,
): Promise<Omit<Plugin, 'id' | 'createdAt'> | null> {
  const raw = await llmWithFallback(
    AUTHOR_SYSTEM,
    `Implement this specific algorithm/technique as a Python tool:\n\nTool name: ${suggestedName}\nMechanics to implement: ${mechanics}\nJustification: ${justification}\n\nGenerate the Python tool now. The tool name MUST be "${suggestedName}".`,
    {
      retries: 2,
      degraded: JSON.stringify({
        name: suggestedName.replace(/[^a-z0-9_]/gi, '_').toLowerCase(),
        description: justification.slice(0, 120) || 'tool generated from blueprint',
        language: 'python',
        code: '# blueprint tool\n\ndef main():\n    print("blueprint tool unavailable")\n\nif __name__ == "__main__":\n    main()\n',
      }),
      complexity: 'standard',
      useJsonMode: true,
    },
  )
  const parsed = parsePlugin(raw.content)
  if (parsed) {
    // Force the suggested name from the blueprint.
    parsed.name = suggestedName.replace(/[^a-z0-9_]/gi, '_').toLowerCase()
    parsed.description = justification.slice(0, 120) || parsed.description
  }
  return parsed
}

// ---------- Deterministic fallback authoring ----------
const DETERMINISTIC_REVIEWER_NAME = 'data_reviewer'
const DETERMINISTIC_REVIEWER_DESCRIPTION = 'Summarizes and keyword-scans research input text with standard-library Python only.'
const DETERMINISTIC_REVIEWER_CODE = `import re
import sys
from collections import Counter


def summarize_text(text: str) -> str:
    text = (text or "").strip()
    if not text:
        return "No input text provided. Nothing to review."

    sentences = [s.strip() for s in re.split(r"[.!?]+", text) if s.strip()]
    words = re.findall(r"[A-Za-z0-9_]{4,}", text.lower())
    top_terms = ", ".join(f"{term}({count})" for term, count in Counter(words).most_common(10))
    sample = text[:500]
    return (
        f"Input length: {len(text)} characters\\n"
        f"Sentence count: {len(sentences)}\\n"
        f"Top terms: {top_terms or 'none'}\\n"
        f"Sample: {sample}..."
    )


def main() -> None:
    if len(sys.argv) > 1:
        input_text = sys.argv[1]
    else:
        input_text = sys.stdin.read()
    try:
        print(summarize_text(input_text))
    except Exception as exc:
        print(f"Review error: {exc}")


if __name__ == "__main__":
    main()
`
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
    const validation = validatePlugin(name, code)
    if (!validation.passed) {
      return { passed: false, error: validation.error }
    }
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

/**
 * TDD: generate a unit test for the tool, execute it, and return the result.
 * The test calls the tool's main() function with a sample input and asserts
 * it produces output without crashing.
 */
export async function runUnitTest(
  name: string,
  code: string,
  capability: string,
): Promise<{ passed: boolean; error?: string; testCode?: string }> {
  // Validate the plugin first.
  const validation = validatePlugin(name, code)
  if (!validation.passed) {
    return { passed: false, error: validation.error, testCode: 'validation_failed' }
  }

  // Generate a test script that imports the tool and runs it.
  const testCode = `import sys, importlib.util, traceback
spec = importlib.util.spec_from_file_location("${name}", "${join(PLUGIN_DIR, name + '.py').replace(/\\/g, '/')}")
try:
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    # Call main() if it exists, else just verify the module loaded.
    if hasattr(mod, 'main'):
        result = mod.main()
        print(f"[TDD PASS] main() returned: {str(result)[:80]}")
    else:
        print("[TDD PASS] module loaded (no main())")
    print("TDD_OK")
except Exception as e:
    print(f"[TDD FAIL] {e}")
    traceback.print_exc()
    print("TDD_FAIL")
`

  const testPath = join(PLUGIN_DIR, `_test_${name}.py`)
  writeFileSync(testPath, testCode, 'utf-8')
  try {
    const stdout = execSync(`python3 ${JSON.stringify(testPath)}`, {
      timeout: 10000,
      stdio: 'pipe',
    }).toString()
    const passed = stdout.includes('TDD_OK')
    return {
      passed,
      error: passed ? undefined : stdout.slice(0, 400),
      testCode,
    }
  } catch (e: any) {
    const stderr = e.stderr?.toString() || e.message || 'test execution failed'
    return { passed: false, error: stderr.slice(0, 400), testCode }
  } finally {
    // Clean up the test file.
    try { unlinkSync(testPath) } catch { /* ignore */ }
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
  const raw = await llmWithFallback(
    PATCH_SYSTEM,
    `Missing capability: ${capability}\n\nFailed code:\n${code}\n\nCompilation/test error:\n${error}\n\nRewrite the ENTIRE corrected script.`,
    {
      retries: 2,
      degraded: JSON.stringify({
        name,
        description: 'patched tool generated when LLM is unavailable',
        language: 'python',
        code: '# patched fallback tool\n\ndef main():\n    print("patched fallback tool unavailable")\n\nif __name__ == "__main__":\n    main()\n',
      }),
      complexity: 'standard',
      useJsonMode: true,
    },
  )
  const patched = parsePlugin(raw.content)
  // keep the original name so we overwrite the same file
  if (patched) patched.name = name
  return patched
}

// ---------- Stage 4: Full Evolution Loop ----------
export interface EvolutionResult {
  plugin: Plugin | null
  gap: { capability: string; rationale: string }
  testStatus: 'passed' | 'failed' | 'patched' | 'reused'
  testError?: string
  /** Name of a reused tool (when reflection found an existing match). */
  reusedToolName?: string
}

/**
 * Reflection: check if an existing tool already covers the identified gap.
 * Uses keyword overlap between the gap capability and tool names/descriptions.
 * Returns the matching tool name, or null if no match.
 */
export function reflectForReuse(
  gapCapability: string,
  tools: { name: string; description: string }[],
): string | null {
  if (!tools.length) return null
  // Extract meaningful keywords (4+ chars, lowercase) from the gap.
  const gapWords = new Set(
    (gapCapability.toLowerCase().match(/\b[a-z]{4,}\b/g) || []).filter(
      (w) => !['that', 'this', 'with', 'from', 'their', 'would', 'could', 'should', 'which', 'there', 'about', 'into'].includes(w),
    ),
  )
  if (gapWords.size === 0) return null

  let bestMatch: { name: string; score: number } | null = null
  for (const t of tools) {
    const toolText = `${t.name} ${t.description}`.toLowerCase()
    const toolWords = new Set((toolText.match(/\b[a-z]{4,}\b/g) || []))
    // Count overlapping keywords.
    let overlap = 0
    for (const w of gapWords) {
      if (toolWords.has(w)) overlap++
    }
    // Require at least 2 keyword overlaps to reuse (avoid false matches).
    if (overlap >= 2 && (!bestMatch || overlap > bestMatch.score)) {
      bestMatch = { name: t.name, score: overlap }
    }
  }
  return bestMatch?.name || null
}

/** Build a deterministic gap when LLM gap analysis is unavailable. */
export function buildDeterministicGap(
  query: string,
  sources: Source[],
  existingTools: { name: string; description: string }[],
): { capability: string; rationale: string } {
  const sourceDigest = sources
    .slice(0, 6)
    .map((s, i) => `${i + 1}. ${s.title} (${s.host})`)
    .join('\n')
  const domainHint = sourceDigest
    ? sourceDigest.slice(0, 120).replace(/\s+/g, ' ')
    : query.slice(0, 120)
  const capability = existingTools.some((t) => t.name === DETERMINISTIC_REVIEWER_NAME)
    ? 'a reusable data-reviewer tool for summarizing collected research inputs'
    : `a deterministic data-reviewer tool for summarizing ${domainHint}`
  return {
    capability,
    rationale: 'When the LLM evolution pipeline is unavailable, the system still needs a safe, stdlib-only tool that can process gathered text and expose gaps for future runs.',
  }
}

/** Create the deterministic fallback tool blueprint. */
export function authorDeterministicTool(gap: { capability: string; rationale: string }): Omit<Plugin, 'id' | 'createdAt'> {
  return {
    name: DETERMINISTIC_REVIEWER_NAME,
    description: DETERMINISTIC_REVIEWER_DESCRIPTION,
    language: 'python',
    code: DETERMINISTIC_REVIEWER_CODE,
  }
}

/** Build a fallback EvolutionResult without calling LLMs. */
export function buildDeterministicEvolutionResult(
  query: string,
  sources: Source[],
  subQueries: string[],
  existingTools: { name: string; description: string }[],
): EvolutionResult {
  const gap = buildDeterministicGap(query, sources, existingTools)
  const reuseName = reflectForReuse(gap.capability, existingTools)
  if (reuseName) {
    return {
      plugin: null,
      gap,
      testStatus: 'reused',
      reusedToolName: reuseName,
    }
  }

  const tool = authorDeterministicTool(gap)
  const test = testTool(tool.name, tool.code)
  if (!test.passed) {
    rollbackTool(tool.name)
    return {
      plugin: null,
      gap,
      testStatus: 'failed',
      testError: test.error || 'deterministic tool failed compile validation',
    }
  }

  const plugin: Plugin = {
    id: uid(),
    name: tool.name,
    description: tool.description,
    language: tool.language,
    code: tool.code,
    createdAt: Date.now(),
    gapAnalysis: gap.capability,
    testStatus: 'passed',
    testError: test.error,
    patched: false,
    executionStatus: 'not_run',
  }
  return { plugin, gap, testStatus: 'passed', testError: test.error }
}

/**
 * Orchestrates the full Self-Teaching Loop with reflection:
 *   gap analysis → reflect (reuse?) → author → test → (patch) → register
 * If reflection finds a reusable tool, returns early with testStatus='reused'.
 * Emits progress via the provided callback.
 */
export async function evolve(
  query: string,
  sources: Source[],
  subQueries: string[],
  existingTools: { name: string; description: string }[],
  onStage: (stage: string, detail?: any) => void,
): Promise<EvolutionResult> {
  // Stage 1 — Gap Analysis
  onStage('gap')
  const gap = await analyzeGap(query, sources, subQueries, existingTools.map((t) => t.name))
  onStage('gap_done', gap)

  // Stage 1.5 — Reflection: check if an existing tool already covers the gap.
  const reuseName = reflectForReuse(gap.capability, existingTools)
  if (reuseName) {
    onStage('reuse', { name: reuseName, capability: gap.capability })
    return {
      plugin: null,
      gap,
      testStatus: 'reused',
      reusedToolName: reuseName,
    }
  }

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

  // Stage 5 — Experience Distillation (EvolveR-style)
  if (testStatus === 'passed' || testStatus === 'patched') {
    try {
      const { distillPrinciple } = await import('./principles')
      const principle = await distillPrinciple(query, gap.capability, tool.name, testStatus)
      if (principle) {
        onStage('distill', { principle })
      }
    } catch (e) {
      // Silently skip distillation if principles module unavailable
    }
  }

  return { plugin, gap, testStatus, testError: test.error }
}
