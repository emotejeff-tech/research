/**
 * tools/plugin_runner.ts — Dynamic runtime execution of evolved tools.
 *
 * Reads the custom_plugins/ directory at runtime (hot-swap) and executes
 * the agent's self-generated Python scripts. When Daytona or E2B sandbox
 * keys are configured, tools run in an isolated cloud sandbox instead of
 * the local host — creating a hard security boundary.
 */
import { exec } from 'child_process'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { PLUGIN_DIR } from '../agents/evolution'
import { executeInSandbox, getActiveSandbox } from './sandbox'

const EXEC_TIMEOUT_MS = 15000

/** Safely escape a CLI argument for shell execution. */
function escapeArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`
}

/**
 * Execute an evolved Python tool by name.
 *
 * Priority: E2B sandbox → Daytona sandbox → local python3.
 * When sandbox keys are configured, the tool's source code is read from disk
 * and executed remotely in an isolated environment.
 */
export async function runEvolvedTool(toolName: string, args: string): Promise<{
  stdout: string
  stderr: string
  ok: boolean
  sandbox?: string
}> {
  const scriptPath = join(PLUGIN_DIR, `${toolName}.py`)
  if (!existsSync(scriptPath)) {
    return { stdout: '', stderr: `Tool not found: ${toolName}`, ok: false }
  }

  // Read the tool's source code.
  const code = readFileSync(scriptPath, 'utf-8')

  // If a sandbox is configured, execute there instead of locally.
  const sandboxType = getActiveSandbox()
  if (sandboxType !== 'local') {
    try {
      const result = await executeInSandbox(code, args)
      return {
        stdout: result.stdout,
        stderr: result.stderr,
        ok: result.ok,
        sandbox: result.sandbox,
      }
    } catch {
      // Silent fallback to local — don't spam console on every tool execution.
    }
  }

  // Local execution (no sandbox or sandbox failed).
  return new Promise((resolve) => {
    const cmd = `python3 ${JSON.stringify(scriptPath)} ${escapeArg(args)}`
    exec(cmd, { timeout: EXEC_TIMEOUT_MS, maxBuffer: 1024 * 256 }, (error, stdout, stderr) => {
      if (error) {
        resolve({
          stdout: (stdout || '').toString().trim(),
          stderr: (stderr || error.message || '').toString().trim().slice(0, 500),
          ok: false,
          sandbox: 'local',
        })
        return
      }
      resolve({
        stdout: (stdout || '').toString().trim(),
        stderr: (stderr || '').toString().trim(),
        ok: true,
        sandbox: 'local',
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
