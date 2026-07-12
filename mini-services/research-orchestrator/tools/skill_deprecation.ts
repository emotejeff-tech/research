/**
 * tools/skill_deprecation.ts — Skill Deprecation Protocol.
 *
 * A background monitor that archives tools with successRate < 50% or zero
 * recent uses to prevent context bloat. Archived tools are moved from
 * registry.json to registry_archive.json (preserved, not deleted).
 */
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import type { PluginMeta } from './plugin_registry'

const __dirname = fileURLToPath(import.meta.url)
const ARCHIVE_PATH = join(__dirname, '..', 'registry_archive.json')
const DEPRECATION_THRESHOLD = 0.5 // successRate < 50%
const STALE_MS = 1000 * 60 * 60 * 24 * 7 // 7 days since last use

interface ArchiveEntry extends PluginMeta {
  archivedAt: number
  archiveReason: string
}

/** Load the archive from disk. */
function loadArchive(): Record<string, ArchiveEntry> {
  try {
    if (existsSync(ARCHIVE_PATH)) {
      return JSON.parse(readFileSync(ARCHIVE_PATH, 'utf-8'))
    }
  } catch {
    /* fresh */
  }
  return {}
}

/**
 * Scan the registry and archive deprecated tools. Returns the list of
 * archived tool names + reasons.
 */
export function deprecateStaleTools(
  registry: Record<string, PluginMeta>,
): { name: string; reason: string }[] {
  const archive = loadArchive()
  const now = Date.now()
  const deprecated: { name: string; reason: string }[] = []

  for (const [name, meta] of Object.entries(registry)) {
    let reason = ''
    // Skip core seed tools (arxiv_fetcher, source_crossref, pdf_outline, opsec_*, ua_*)
    if (['arxiv_fetcher', 'source_crossref', 'pdf_outline', 'opsec_log_scrubber', 'ua_rotator'].includes(name)) {
      continue
    }
    // Low success rate
    if ((meta.successRate || 1) < DEPRECATION_THRESHOLD && (meta.usageCount || 0) >= 2) {
      reason = `successRate ${(meta.successRate || 0) * 100}% < 50% threshold`
    }
    // Stale: never used or not used in 7 days
    else if ((meta.usageCount || 0) === 0 && now - meta.created > STALE_MS) {
      reason = 'zero uses and created >7 days ago'
    } else if (meta.lastUsed && now - meta.lastUsed > STALE_MS) {
      reason = `not used in ${Math.round((now - meta.lastUsed) / (1000 * 60 * 60 * 24))} days`
    }

    if (reason) {
      archive[name] = { ...meta, archivedAt: now, archiveReason: reason }
      delete registry[name]
      deprecated.push({ name, reason })
    }
  }

  if (deprecated.length > 0) {
    writeFileSync(ARCHIVE_PATH, JSON.stringify(archive, null, 2), 'utf-8')
    writeFileSync(join(__dirname, '..', 'custom_plugins', 'registry.json'), JSON.stringify(registry, null, 2), 'utf-8')
    console.log(`[deprecation] archived ${deprecated.length} stale tool(s): ${deprecated.map((d) => d.name).join(', ')}`)
  }
  return deprecated
}

/** Get archive stats. */
export function getArchiveStats(): { count: number; tools: string[] } {
  const archive = loadArchive()
  return { count: Object.keys(archive).length, tools: Object.keys(archive) }
}
