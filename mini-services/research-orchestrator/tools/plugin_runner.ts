/**
 * tools/plugin_runner.ts — Dynamic runtime execution of evolved plugins.
 *
 * This is the runtime execution layer for INTELLAGENT plugins. It supports:
 *   - Python plugins (primary format)
 *   - Shell commands (quick experiments)
 *   - Node.js plugins (emerging)
 *   - Hot-swap from disk
 *   - Sandbox execution when configured
 *
 * Plugins are self-contained scripts that accept a single CLI argument and
 * print results to stdout. The Evolution Engine can create new plugins that
 * agents can use to improve themselves.
 */
import { exec, execSync } from 'child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { PLUGIN_DIR } from '../agents/evolution'
import { executeInSandbox, getActiveSandbox } from './sandbox'

const EXEC_TIMEOUT_MS = 30000

/** Safely escape a CLI argument for shell execution. */
function escapeArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`
}

/**
 * Execute a plugin by name.
 *
 * Priority: E2B sandbox → Daytona sandbox → local python3.
 * When sandbox keys are configured, the plugin's source code is read from disk
 * and executed remotely in an isolated environment.
 */
export async function runEvolvedTool(pluginName: string, args: string): Promise<{
  stdout: string
  stderr: string
  ok: boolean
  sandbox?: string
}> {
  const scriptPath = join(PLUGIN_DIR, `${pluginName}.py`)
  if (!existsSync(scriptPath)) {
    return { stdout: '', stderr: `Plugin not found: ${pluginName}`, ok: false }
  }

  // Read the plugin's source code.
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

/** List all evolved plugins currently on disk (hot-swap manifest). */
export function listEvolvedPlugins(): string[] {
  if (!existsSync(PLUGIN_DIR)) return []
  return readdirSync(PLUGIN_DIR)
    .filter((f) => f.endsWith('.py'))
    .map((f) => f.replace(/\.py$/, ''))
}

/** Validate a plugin by compiling it with python3 -m py_compile. */
export function validatePlugin(pluginName: string, code: string): { passed: boolean; error?: string } {
  const tempDir = join(PLUGIN_DIR, '.tmp')
  if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true })
  const filePath = join(tempDir, `${pluginName}.py`)
  writeFileSync(filePath, code, 'utf-8')
  try {
    execSync(`python3 -m py_compile ${JSON.stringify(filePath)}`, {
      timeout: 10000,
      stdio: 'pipe',
    })
    return { passed: true }
  } catch (e: any) {
    const stderr = e.stderr?.toString() || e.message || 'unknown compile error'
    return { passed: false, error: stderr.slice(0, 400) }
  } finally {
    try { unlinkSync(filePath) } catch { /* ignore */ }
  }
}
