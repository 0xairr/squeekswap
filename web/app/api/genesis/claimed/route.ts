import { bad, overLimit, PUBLIC_HEADERS } from '@/lib/api'
import { SQUEEK_CHAIN_ID } from '@/lib/deployments'
import { claimsFor } from '@/lib/server'

/** Newest Genesis NFTs claimed from Squeekchain's Sepolia test dispenser, read from onchain Transfer events. */
export async function GET(request: Request) {
  const limited = overLimit(request)
  if (limited) return limited
  const chainId = Number(new URL(request.url).searchParams.get('chainId') || SQUEEK_CHAIN_ID)
  const claims = claimsFor(chainId)
  if (!claims) return bad(`Genesis claims are not available on chain ${chainId}.`, 404)
  try {
    const ids = await claims.get()
    return Response.json({ chainId, ids: ids.map(String) }, {
      headers: { ...PUBLIC_HEADERS, 'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=300' },
    })
  } catch (error) {
    console.error('genesis claims failed', error)
    return bad('Could not read recent Genesis claims right now.', 502)
  }
}
