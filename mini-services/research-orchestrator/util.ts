/** Small shared utilities. */

export const uid = () => Math.random().toString(36).slice(2, 10)

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Robust JSON extraction from LLM output. Handles ```json fences and
 * surrounding prose by progressively shrinking the candidate slice.
 */
export function extractJSON<T = any>(text: string): T | null {
  if (!text) return null
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fence ? fence[1] : text
  const start = candidate.search(/[\[{]/)
  if (start === -1) return null
  for (let end = candidate.length; end > start; end--) {
    const slice = candidate.slice(start, end)
    try {
      return JSON.parse(slice) as T
    } catch {
      /* continue shrinking */
    }
  }
  return null
}
