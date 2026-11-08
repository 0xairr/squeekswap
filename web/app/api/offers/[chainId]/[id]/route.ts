import { bad, FRESH_HEADERS, overLimit, PUBLIC_HEADERS } from '@/lib/api'
import { indexerFor } from '@/lib/server'

export async function GET(request: Request, { params }: { params: Promise<{ chainId: string; id: string }> }) {
  const limited = overLimit(request)
  if (limited) return limited
  const { chainId: rawChain, id } = await params
  if (!/^\d+$/.test(rawChain) || !/^\d+$/.test(id) || id === '0') return bad('Use /api/offers/<chainId>/<offer number>.')
  const chainId = Number(rawChain)
  const indexer = indexerFor(chainId)
  if (!indexer) return bad(`SqueekSwap is not deployed on chain ${chainId}.`, 404)
  // `fresh=1`: the browser just confirmed a transaction, so serve a new index and keep it out of the CDN.
  const fresh = new URL(request.url).searchParams.get('fresh') === '1'
  const headers = fresh ? FRESH_HEADERS : PUBLIC_HEADERS
  try {
    let snapshot = await indexer.get(fresh ? { maxAgeMs: 0 } : {})
    let record = snapshot.offers.find((offer) => offer.id === id)
    // Force a fresh read only for numbers that can plausibly exist (a just-created offer), so requests for
    // made-up numbers cannot keep the indexer re-reading the chain.
    if (!record && BigInt(id) <= BigInt(snapshot.offerCount) + 25n) {
      snapshot = await indexer.get({ maxAgeMs: 0 })
      record = snapshot.offers.find((offer) => offer.id === id)
    }
    if (!record) {
      const orphan = snapshot.orphans.find((offer) => offer.id === id) ?? null
      return Response.json({ error: orphan ? 'This offer exists, but its event details could not be read.' : 'No such offer.', orphan }, { status: 404, headers })
    }
    return Response.json({
      chainId,
      swap: snapshot.swap,
      block: snapshot.block,
      record,
      accept: { to: snapshot.swap, functionName: 'fill', args: [id, record.offer] },
    }, { headers })
  } catch {
    return bad('Could not read SqueekSwap from the chain right now. Try again shortly.', 502)
  }
}
