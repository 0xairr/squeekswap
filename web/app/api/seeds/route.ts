import { getAddress, isAddress, type Address } from 'viem'
import { bad, overLimit, PUBLIC_HEADERS } from '@/lib/api'
import { deploymentFor, SQUEEK_CHAIN_ID } from '@/lib/deployments'
import { same } from '@/lib/format'
import { isOfficial } from '@/lib/offers'
import { scoreSeeds, SEEDS, utcDay, type Fill } from '@/lib/seeds'
import { indexerFor, roundsFor } from '@/lib/server'
import { fromWire } from '@/lib/wire'

/**
 * Seeds leaderboard, recomputed from public chain data on every refresh: completed SqueekSwap V2 swaps of
 * official Genesis NFTs, plus Squeektoshi's wheel rounds from SqueekCore. `?wallet=0x…` adds that wallet's detail.
 */
export async function GET(request: Request) {
  const limited = overLimit(request)
  if (limited) return limited
  const url = new URL(request.url)
  const chainId = Number(url.searchParams.get('chainId') || SQUEEK_CHAIN_ID)
  const rawWallet = url.searchParams.get('wallet')
  if (rawWallet && !isAddress(rawWallet)) return bad('wallet must be an address.')
  const deployment = deploymentFor(chainId)
  const indexer = indexerFor(chainId)
  const rounds = roundsFor(chainId)
  if (!deployment || !indexer || !rounds) return bad(`Seeds are not available on chain ${chainId}.`, 404)

  try {
    const [snapshot, wheel] = await Promise.all([indexer.get(), rounds.get()])
    const fills: Fill[] = snapshot.offers.flatMap((record) => {
      if (record.status !== 'filled' || !record.filledBy || record.filledAt === undefined) return []
      const offer = fromWire(record.offer)
      if (![...offer.give, ...offer.want].every((asset) => isOfficial(asset, deployment.squeeks))) return []
      return [{ id: record.id, maker: offer.maker, taker: record.filledBy, give: offer.give, want: offer.want, time: record.filledAt }]
    })
    const { swaps, wallets } = scoreSeeds(fills, wheel.active, wheel.settledThroughRound)
    const leaderboard = wallets.slice(0, 100).map((entry, index) => ({ rank: index + 1, ...entry }))

    let wallet = null
    if (rawWallet) {
      const address = getAddress(rawWallet) as Address
      const index = wallets.findIndex((entry) => same(entry.wallet, address))
      const today = utcDay(Math.floor(Date.now() / 1000))
      const mine = swaps.filter((swap) => {
        const fill = fills.find((f) => f.id === swap.id)!
        return same(fill.maker, address) || same(fill.taker, address)
      })
      const sideOf = (id: string) => (same(fills.find((f) => f.id === id)!.maker, address) ? 'maker' : 'taker') as 'maker' | 'taker'
      wallet = {
        address,
        rank: index >= 0 ? index + 1 : null,
        seeds: index >= 0 ? wallets[index].seeds : 0,
        swaps: index >= 0 ? wallets[index].swaps : 0,
        zoomies: index >= 0 ? wallets[index].zoomies : 0,
        scoredToday: mine.filter((swap) => utcDay(swap.time) === today && swap[sideOf(swap.id)].reason === 'scored').length,
        history: mine.slice(-20).reverse().map((swap) => ({ id: swap.id, time: swap.time, zoomies: swap.zoomies, nfts: swap.nfts, ...swap[sideOf(swap.id)] })),
      }
    }

    return Response.json({
      chainId,
      rules: SEEDS,
      settledThroughRound: wheel.settledThroughRound.toString(),
      totalScoredSwaps: swaps.filter((swap) => swap.maker.reason === 'scored' || swap.taker.reason === 'scored').length,
      leaderboard,
      wallet,
    }, { headers: PUBLIC_HEADERS })
  } catch {
    return bad('Could not compute Seeds right now. Try again shortly.', 502)
  }
}
