/**
 * tools/sdk.ts — z-ai-web-dev-sdk singleton (backend-only).
 */
import ZAI from 'z-ai-web-dev-sdk'

let zai: any = null

export async function getZAI() {
  if (!zai) zai = await ZAI.create()
  return zai
}
