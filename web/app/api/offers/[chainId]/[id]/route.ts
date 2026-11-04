import { bad, overLimit, PUBLIC_HEADERS } from '@/lib/api'
import { indexerFor } from '@/lib/server'

export async function GET(request: Request, { params }: { params: Promise<{ chainId: string; id: string }> }) {
  const limited = overLimit(request)
  if (limited) return limited
  const { chainId: rawChain, id } = await params
  if (!/^\d+$/.test(rawChain) || !/^\d+$/.test(id) || id === '0') return bad('Use /api/offers/<chainId>/<offer number>.')
  const chainId = Number(rawChain)
  const indexer = indexerFor(chainId)
  if (!indexer) return bad(`SqueekSwap is not deployed on chain ${chainId}.`, 404)
  try {
    let snapshot = await indexer.get()
    let record = snapshot.offers.find((offer) => offer.id === id)
    // Force a fresh read only for numbers that can plausibly exist (a just-created offer), so requests for
    // made-up numbers cannot keep the indexer re-reading the chain.
    if (!record && BigInt(id) <= BigInt(snapshot.offerCount) + 25n) {
      snapshot = await indexer.get({ maxAgeMs: 0 })
      record = snapshot.offers.find((offer) => offer.id === id)
    }
    if (!record) {
      const orphan = snapshot.orphans.find((offer) => offer.id === id) ?? null
      return Response.json({ error: orphan ? 'This offer exists, but its event details could not be read.' : 'No such offer.', orphan }, { status: 404, headers: PUBLIC_HEADERS })
    }
    return Response.json({
      chainId,
      swap: snapshot.swap,
      block: snapshot.block,
      record,
      accept: { to: snapshot.swap, functionName: 'fill', args: [id, record.offer] },
    }, { headers: PUBLIC_HEADERS })
  } catch {
    return bad('Could not read SqueekSwap from the chain right now. Try again shortly.', 502)
  }
}
