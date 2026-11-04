import { isAddress } from 'viem'
import { bad, overLimit, PUBLIC_HEADERS } from '@/lib/api'
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
  try {
    const snapshot = await indexer.get()
    const offers = filterOffers(snapshot.offers, { status: status as OfferStatus | undefined, maker, taker })
    const orphans = maker ? snapshot.orphans.filter((orphan) => same(orphan.maker, maker)) : snapshot.orphans
    return Response.json({ ...snapshot, offers, orphans }, { headers: PUBLIC_HEADERS })
  } catch {
    return bad('Could not read SqueekSwap from the chain right now. Try again shortly.', 502)
  }
}
