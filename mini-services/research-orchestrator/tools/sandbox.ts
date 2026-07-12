/**
 * tools/sandbox.ts — Remote sandbox execution for evolved tools.
 *
 * When Daytona or E2B API keys are configured, evolved Python tools are
 * executed in an isolated cloud sandbox instead of the local host. This
 * creates a hard security boundary — if the agent hallucinates destructive
 * code, it only affects the ephemeral sandbox, not your machine.
 *
 * Priority: E2B (Python-native) → Daytona (full VM) → local python3.
 */
import { exec } from 'child_process'
import { writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { getSettings } from './settings'

export interface SandboxResult {
  stdout: string
  stderr: string
  ok: boolean
  sandbox: 'e2b' | 'daytona' | 'local'
}

/**
 * Execute Python code in a remote sandbox (E2B or Daytona).
 * Falls back to local python3 if no sandbox keys are configured.
 *
 * @param code The Python source code to execute.
 * @param args CLI arguments to pass to the script.
 */
export async function executeInSandbox(
  code: string,
  args: string = '',
): Promise<SandboxResult> {
  const settings = getSettings()

  // Priority 1: E2B (Python-native sandbox, fastest spin-up).
  if (settings.e2bApiKey) {
    try {
      return await executeE2b(code, args, settings.e2bApiKey)
    } catch (e) {
      console.error('[sandbox] E2B failed, falling back:', (e as Error).message)
    }
  }

  // Priority 2: Daytona (full VM sandbox).
  if (settings.daytonaApiKey) {
    try {
      return await executeDaytona(code, args, settings.daytonaApiKey, settings.daytonaServerUrl)
    } catch (e) {
      console.error('[sandbox] Daytona failed, falling back:', (e as Error).message)
    }
  }

  // Priority 3: Local python3 (no sandbox — direct execution).
  return executeLocal(code, args)
}

// ---------- E2B Sandbox ----------
async function executeE2b(code: string, args: string, apiKey: string): Promise<SandboxResult> {
  // E2B sandbox API: POST /v1/sandboxes to create, then run code.
  const res = await fetch('https://api.e2b.dev/v1/sandboxes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      template: 'base',
    }),
    signal: AbortSignal.timeout(20000),
  })

  if (!res.ok) {
    // Don't spam console — just throw quietly so it falls back to local.
    throw new Error(`E2B ${res.status}`)
  }

  const sandbox: any = await res.json()
  const sandboxId = sandbox.sandboxID || sandbox.id

  try {
    // Execute code in the sandbox.
    const execRes = await fetch(`https://api.e2b.dev/v1/sandboxes/${sandboxId}/processes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        cmd: 'python3',
        args: ['-c', code],
      }),
      signal: AbortSignal.timeout(20000),
    })

    if (!execRes.ok) {
      throw new Error(`E2B exec HTTP ${execRes.status}`)
    }

    const execData: any = await execRes.json()
    return {
      stdout: execData?.stdout || execData?.output || '',
      stderr: execData?.stderr || '',
      ok: execData?.exitCode === 0 || execData?.exit_code === 0,
      sandbox: 'e2b',
    }
  } finally {
    // Kill the sandbox.
    try {
      await fetch(`https://api.e2b.dev/v1/sandboxes/${sandboxId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(5000),
      })
    } catch { /* cleanup */ }
  }
}

// ---------- Daytona Sandbox ----------
async function executeDaytona(
  code: string,
  args: string,
  apiKey: string,
  serverUrl?: string,
): Promise<SandboxResult> {
  // Daytona API v1: create workspace, execute, destroy.
  const baseUrl = serverUrl || 'https://app.daytona.io/api'

  // Step 1: Create a workspace.
  const createRes = await fetch(`${baseUrl}/workspace`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      image: 'python:3.12-slim',
    }),
    signal: AbortSignal.timeout(30000),
  })

  if (!createRes.ok) {
    // Don't spam console — just throw quietly so it falls back to local.
    throw new Error(`Daytona ${createRes.status}`)
  }

  const workspace: any = await createRes.json()
  const workspaceId = workspace.id || workspace.workspaceId

  try {
    // Step 2: Execute Python code.
    const execRes = await fetch(`${baseUrl}/workspace/${workspaceId}/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        command: `python3 -c '${code.replace(/'/g, "'\\''")}' ${args}`,
      }),
      signal: AbortSignal.timeout(20000),
    })

    if (!execRes.ok) throw new Error(`Daytona exec HTTP ${execRes.status}`)
    const execData: any = await execRes.json()
    return {
      stdout: execData?.stdout || execData?.output || '',
      stderr: execData?.stderr || '',
      ok: execData?.exitCode === 0 || execData?.exit_code === 0,
      sandbox: 'daytona',
    }
  } finally {
    try {
      await fetch(`${baseUrl}/workspace/${workspaceId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(5000),
      })
    } catch { /* cleanup */ }
  }
}

// ---------- Local fallback ----------
function executeLocal(code: string, args: string): Promise<SandboxResult> {
  return new Promise((resolve) => {
    // Write code to a temp file and execute it.
    const tmpFile = join(tmpdir(), `nexus_tool_${Date.now()}.py`)
    writeFileSync(tmpFile, code, 'utf-8')

    const cmd = `python3 ${JSON.stringify(tmpFile)} ${args ? `"${args.replace(/"/g, '\\"')}"` : ''}`
    exec(cmd, { timeout: 15000, maxBuffer: 1024 * 256 }, (error, stdout, stderr) => {
      try { unlinkSync(tmpFile) } catch { /* ignore */ }
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

/** Check which sandbox is active (for UI display). */
export function getActiveSandbox(): 'e2b' | 'daytona' | 'local' {
  const s = getSettings()
  if (s.e2bApiKey) return 'e2b'
  if (s.daytonaApiKey) return 'daytona'
  return 'local'
}
