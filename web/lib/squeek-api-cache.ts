import { fetchUpstream } from './upstream'

type SqueekApiPage = {
  status: 'available' | 'unavailable'
  reason?: string
  tokenId?: string
  custody?: { owner?: string | null; depositor?: string | null; burned?: boolean }
  level?: number
  mergeState?: string | null
  metadata?: { status?: string; imageDataUri?: string; cardImageUrl?: string } | null
}

type CacheEntry = { value: SqueekApiPage; expiresAt: number }
type SqueekCache = { values: Map<string, CacheEntry>; inflight: Map<string, Promise<SqueekApiPage>> }

const shared = globalThis as typeof globalThis & { __squeekApiCache?: SqueekCache }
const cache = shared.__squeekApiCache ??= { values: new Map(), inflight: new Map() }
const TTL_MS = 5 * 60_000
const RETRY_MS = 15_000

// Squeekchain's API sheds load under bursts (it answered 503 to 40 concurrent requests in testing). Capping
// concurrent upstream calls keeps a burst of artwork requests from getting this server throttled.
const UPSTREAM_SLOTS = 6
let active = 0
const queue: Array<() => void> = []

async function upstream(id: string): Promise<Response> {
  if (active >= UPSTREAM_SLOTS) await new Promise<void>((resolve) => queue.push(resolve))
  active++
  try {
    return await fetchUpstream(`https://api.squeekchain.com/v1/squeeks/${id}`, {
      headers: { accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(8_000),
    })
  } finally {
    active--
    queue.shift()?.()
  }
}

export async function cachedSqueek(id: string): Promise<SqueekApiPage> {
  const cached = cache.values.get(id)
  if (cached && cached.expiresAt > Date.now()) return cached.value
  const pending = cache.inflight.get(id)
  if (pending) return pending

  const fetchPage = async (): Promise<SqueekApiPage> => {
    const response = await upstream(id)
    if (!response.ok) throw new Error(`Squeekchain API returned HTTP ${response.status}.`)
    return response.json() as Promise<SqueekApiPage>
  }
  const isComplete = (page: SqueekApiPage) => page.status === 'available' && !!page.metadata?.imageDataUri
  const request = (async () => {
    let value = await fetchPage().catch(() => null)
    // Under load the API sometimes answers with an error or without artwork; one short retry usually succeeds
    // and avoids showing a broken image until the visitor reloads.
    if (!value || !isComplete(value)) {
      await new Promise((resolve) => setTimeout(resolve, 750))
      value = await fetchPage()
    }
    // A still-incomplete answer is kept only briefly instead of hiding the artwork for the full TTL.
    cache.values.set(id, { value, expiresAt: Date.now() + (isComplete(value) ? TTL_MS : RETRY_MS) })
    return value
  })().finally(() => cache.inflight.delete(id))
  cache.inflight.set(id, request)
  return request
}
