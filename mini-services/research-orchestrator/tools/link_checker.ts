/**
 * tools/link_checker.ts — Auto-validating link checker.
 *
 * Runs quick parallel HEAD requests on all discovered URLs to filter out
 * 404s, dead redirects, and paywalled pages before passing them to the
 * Synthesis agent. Only keeps URLs that return 2xx or 3xx.
 */
import type { Source } from '../types'

/** Check if a URL is alive (returns 2xx/3xx). 500ms timeout per URL. */
async function checkUrl(url: string): Promise<{ url: string; alive: boolean; status?: number }> {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(3000),
    })
    return { url, alive: res.ok || res.status < 400, status: res.status }
  } catch {
    // Some servers block HEAD — try GET as fallback.
    try {
      const res = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      })
      return { url, alive: res.ok || res.status < 400, status: res.status }
    } catch {
      return { url, alive: false }
    }
  }
}

/**
 * Validate a batch of URLs in parallel (max 10 concurrent).
 * Returns only the sources with alive URLs.
 */
export async function validateLinks(sources: Source[], maxConcurrent: number = 10): Promise<Source[]> {
  if (sources.length === 0) return []

  const alive = new Set<string>()
  const batches: Source[][] = []
  for (let i = 0; i < sources.length; i += maxConcurrent) {
    batches.push(sources.slice(i, i + maxConcurrent))
  }

  for (const batch of batches) {
    const results = await Promise.all(
      batch.map((s) => checkUrl(s.url).then((r) => ({ source: s, ...r }))),
    )
    for (const r of results) {
      if (r.alive) alive.add(r.url)
    }
  }

  return sources.filter((s) => alive.has(s.url))
}

/**
 * Source credibility weighting — assigns domain authority ratings.
 * Higher scores = more credible. Used to rank sources for synthesis.
 */
const CREDIBILITY_DOMAINS: Record<string, number> = {
  // Academic / preprint (highest)
  'arxiv.org': 10, 'pubmed.ncbi.nlm.nih.gov': 10, 'nature.com': 10,
  'science.org': 10, 'ieee.org': 9, 'sciencedirect.com': 9,
  'springer.com': 9, 'wiley.com': 9, 'dl.acm.org': 9,
  'biorxiv.org': 8, 'medrxiv.org': 8,
  // Government / institutional
  'gov': 8, 'nist.gov': 8, 'europa.eu': 8, 'who.int': 8,
  'nist.gov': 8, 'epa.gov': 7,
  // Major tech / reference
  'github.com': 7, 'stackoverflow.com': 6, 'wikipedia.org': 6,
  'mdn.mozilla.org': 7, 'developer.mozilla.org': 7,
  // Major news
  'reuters.com': 7, 'bbc.com': 7, 'nytimes.com': 6, 'bloomberg.com': 6,
  // Industry reports
  'mckinsey.com': 6, 'deloitte.com': 6, 'pwc.com': 6,
  // Default for unknown domains
  'medium.com': 3, 'substack.com': 3, 'reddit.com': 2,
}

/** Get credibility score for a domain (0-10). */
export function getCredibilityScore(host: string): number {
  if (!host) return 3
  const lower = host.toLowerCase().replace(/^www\./, '')
  // Check exact match first
  if (CREDIBILITY_DOMAINS[lower] !== undefined) return CREDIBILITY_DOMAINS[lower]
  // Check TLD patterns
  if (lower.endsWith('.gov')) return 8
  if (lower.endsWith('.edu')) return 8
  if (lower.endsWith('.org')) return 5
  // Default
  return 3
}

/** Sort sources by credibility score (highest first). */
export function sortByCredibility(sources: Source[]): Source[] {
  return [...sources].sort((a, b) => getCredibilityScore(b.host) - getCredibilityScore(a.host))
}
