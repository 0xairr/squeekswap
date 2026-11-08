import { clientKey, createLimiter } from './guard'

// Shared by the public read routes. Responses are public chain data, so any origin may read them.
export const PUBLIC_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30',
}

/** For a read a browser asked to be fresh (right after its own transaction): never stored by the CDN. */
export const FRESH_HEADERS = { ...PUBLIC_HEADERS, 'Cache-Control': 'no-store' }

/**
 * Separate budgets per kind of traffic, so wallet polling through /api/rpc or a grid of lazy artwork cannot
 * starve the offer and Genesis reads (or the other way round). Each bucket also has a server-wide ceiling:
 * the per-client key comes from proxy headers, so the ceiling bounds what spoofed keys can spend upstream.
 */
const BUCKETS = {
  api: { perClient: 300, global: 6_000 },
  rpc: { perClient: 900, global: 15_000 },
  image: { perClient: 1_500, global: 30_000 },
} as const
export type Bucket = keyof typeof BUCKETS

const limiters = Object.fromEntries(
  Object.entries(BUCKETS).map(([name, b]) => [name, { client: createLimiter(b.perClient, 60_000), global: createLimiter(b.global, 60_000) }]),
) as Record<Bucket, { client: ReturnType<typeof createLimiter>; global: ReturnType<typeof createLimiter> }>

/** A 429 response when this client (or the whole server) is over its budget for `bucket`, else null. */
export function overLimit(request: Request, bucket: Bucket = 'api', weight = 1): Response | null {
  const { client, global } = limiters[bucket]
  const own = client(clientKey(request), weight)
  const hit = own.ok ? global('all', weight) : own
  if (hit.ok) return null
  return Response.json({ error: 'Too many requests. Try again shortly.' }, { status: 429, headers: { 'Retry-After': String(hit.retryAfter) } })
}

export function bad(message: string, status = 400): Response {
  return Response.json({ error: message }, { status, headers: { 'Access-Control-Allow-Origin': '*' } })
}
