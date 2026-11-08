import { isAddress } from 'viem'
import { bad, FRESH_HEADERS, overLimit, PUBLIC_HEADERS } from '@/lib/api'
import { same } from '@/lib/format'
import { filterOffers } from '@/lib/indexer'
import type { OfferStatus } from '@/lib/offers'
import { indexerFor } from '@/lib/server'

const STATUSES: OfferStatus[] = ['open', 'expired', 'filled', 'closed', 'revoked']

export async function GET(request: Request) {
  const limited = overLimit(request)
  if (limited) return limited
  const params = new URL(request.url).searchParams
  const chainId = Number(params.get('chainId') ?? '11155111')
  const status = params.get('status') ?? undefined
  const maker = params.get('maker') ?? undefined
  const taker = params.get('taker') ?? undefined
  if (status && !STATUSES.includes(status as OfferStatus)) return bad(`status must be one of ${STATUSES.join(', ')}.`)
  if (maker && !isAddress(maker)) return bad('maker must be an address.')
  if (taker && taker !== 'any' && !isAddress(taker)) return bad('taker must be an address or “any”.')
  const indexer = indexerFor(chainId)
  if (!indexer) return bad(`SqueekSwap is not deployed on chain ${chainId}.`, 404)
  // `fresh=1`: the browser just confirmed a transaction, so serve a new index and keep it out of the CDN.
  const fresh = params.get('fresh') === '1'
  try {
    const snapshot = await indexer.get(fresh ? { maxAgeMs: 0 } : {})
    const offers = filterOffers(snapshot.offers, { status: status as OfferStatus | undefined, maker, taker })
    const orphans = maker ? snapshot.orphans.filter((orphan) => same(orphan.maker, maker)) : snapshot.orphans
    return Response.json({ ...snapshot, offers, orphans }, { headers: fresh ? FRESH_HEADERS : PUBLIC_HEADERS })
  } catch {
    return bad('Could not read SqueekSwap from the chain right now. Try again shortly.', 502)
  }
}
