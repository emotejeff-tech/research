/**
 * tools/plugin_runner.ts — Dynamic runtime execution of evolved tools.
 *
 * Reads the custom_plugins/ directory at runtime (hot-swap) and executes
 * the agent's self-generated Python scripts in an isolated child process
 * with a timeout. If a tool throws a runtime error, the stack trace is
 * returned so the orchestrator can feed it to the Critic for patching.
 */
import { exec } from 'child_process'
import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { PLUGIN_DIR } from '../agents/evolution'

const EXEC_TIMEOUT_MS = 8000

/** Safely escape a CLI argument for shell execution. */
function escapeArg(arg: string): string {
  // wrap in single quotes and escape any embedded single quotes
  return `'${arg.replace(/'/g, "'\\''")}'`
}

/**
 * Execute an evolved Python tool by name. Returns stdout on success or
 * throws with stderr on failure (caller can feed it to the Critic).
 */
export function runEvolvedTool(toolName: string, args: string): Promise<{
  stdout: string
  stderr: string
  ok: boolean
}> {
  return new Promise((resolve) => {
    const scriptPath = join(PLUGIN_DIR, `${toolName}.py`)
    if (!existsSync(scriptPath)) {
      resolve({ stdout: '', stderr: `Tool not found: ${toolName}`, ok: false })
      return
    }
    const cmd = `python3 ${JSON.stringify(scriptPath)} ${escapeArg(args)}`
    exec(cmd, { timeout: EXEC_TIMEOUT_MS, maxBuffer: 1024 * 256 }, (error, stdout, stderr) => {
      if (error) {
        resolve({
          stdout: (stdout || '').toString().trim(),
          stderr: (stderr || error.message || '').toString().trim().slice(0, 500),
          ok: false,
        })
        return
      }
      resolve({
        stdout: (stdout || '').toString().trim(),
        stderr: (stderr || '').toString().trim(),
        ok: true,
      })
    })
  })
}

/** List all evolved tools currently on disk (hot-swap manifest). */
export function listEvolvedTools(): string[] {
  if (!existsSync(PLUGIN_DIR)) return []
  return readdirSync(PLUGIN_DIR)
    .filter((f) => f.endsWith('.py'))
    .map((f) => f.replace(/\.py$/, ''))
}
