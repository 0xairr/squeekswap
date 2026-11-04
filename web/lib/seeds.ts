import type { Address } from 'viem'
import { assetKey, type Asset } from './offers'

// Seeds 🌻: SqueekSwap's own points, earned by completing Genesis swaps. Computed offchain from public
// onchain data only (OfferFilled on SqueekSwap V2, RoundRecorded/BatchSettled on SqueekCore), so anyone can
// recompute every number. Seeds are not Squeekchain Aura.

export const SEEDS = {
  /** Seeds for each wallet in a scored swap. */
  base: 10,
  /** Extra Seeds per NFT beyond the first two in the swap (both sides counted, NFTs on cooldown excluded). */
  perExtraNft: 2,
  /** Multiplier when the swap's round had Squeektoshi on the wheel. */
  zoomies: 2,
  /** Scored swaps per wallet per UTC day. */
  dailyCap: 3,
  /** Each NFT earns Seeds at most once per this window, whoever holds it. */
  nftCooldownSeconds: 3 * 24 * 60 * 60,
} as const

/** SqueekCore rounds: 600 s each from genesisTimestamp (read from /v1/core configuration). */
export const ROUNDS = { genesisTimestamp: 1793022600, duration: 600 } as const

export const roundOf = (unixSeconds: number): bigint => BigInt(Math.floor((unixSeconds - ROUNDS.genesisTimestamp) / ROUNDS.duration))
export const utcDay = (unixSeconds: number): string => new Date(unixSeconds * 1000).toISOString().slice(0, 10)

export type Fill = {
  id: string
  maker: Address
  taker: Address
  give: readonly Asset[]
  want: readonly Asset[]
  /** Block timestamp of the fill, unix seconds. */
  time: number
}

export type Zoomies = 'yes' | 'no' | 'pending'
export type SideResult = { seeds: number; reason: 'scored' | 'daily-cap' | 'pair-today' | 'cooldown' }
export type ScoredSwap = { id: string; time: number; round: string; zoomies: Zoomies; nfts: number; counted: number; maker: SideResult; taker: SideResult }
export type WalletSeeds = { wallet: Address; seeds: number; swaps: number; zoomies: number }

/**
 * Scores fills in chain order. `activeRounds` holds every round with a RoundRecorded event; rounds after
 * `settledThroughRound` are not final yet, so their Zoomies bonus is pending (counted as no bonus for now).
 */
export function scoreSeeds(fills: Fill[], activeRounds: ReadonlySet<string>, settledThroughRound: bigint): { swaps: ScoredSwap[]; wallets: WalletSeeds[] } {
  const ordered = [...fills].sort((a, b) => a.time - b.time || (BigInt(a.id) < BigInt(b.id) ? -1 : 1))
  const perDay = new Map<string, number>() // `${wallet}:${day}` -> scored swaps that day
  const pairs = new Set<string>() // `${low}:${high}:${day}` -> pair already scored that day
  const earnedAt = new Map<string, number>() // assetKey -> last time the NFT earned Seeds in a scored swap
  const totals = new Map<string, WalletSeeds>()
  const swaps: ScoredSwap[] = []

  for (const fill of ordered) {
    const maker = fill.maker.toLowerCase()
    const taker = fill.taker.toLowerCase()
    const day = utcDay(fill.time)
    const round = roundOf(fill.time)
    const zoomies: Zoomies = round > settledThroughRound ? 'pending' : activeRounds.has(round.toString()) ? 'yes' : 'no'

    // Per-NFT cooldown: an NFT that earned Seeds in the last 3 days does not count again, whoever holds it.
    // This bounds farming by the number of real NFTs, not the number of wallets passing them around.
    const fresh = [...fill.give, ...fill.want].filter((asset) => {
      const last = earnedAt.get(assetKey(asset))
      return last === undefined || fill.time - last > SEEDS.nftCooldownSeconds
    })
    const nfts = fill.give.length + fill.want.length
    const counted = fresh.length

    const pairKey = `${[maker, taker].sort().join(':')}:${day}`
    const pairUsed = pairs.has(pairKey)
    const side = (wallet: string): SideResult => {
      if (counted === 0) return { seeds: 0, reason: 'cooldown' }
      if (pairUsed) return { seeds: 0, reason: 'pair-today' }
      if ((perDay.get(`${wallet}:${day}`) ?? 0) >= SEEDS.dailyCap) return { seeds: 0, reason: 'daily-cap' }
      const base = SEEDS.base + SEEDS.perExtraNft * Math.max(0, counted - 2)
      return { seeds: zoomies === 'yes' ? base * SEEDS.zoomies : base, reason: 'scored' }
    }
    const makerResult = side(maker)
    const takerResult = side(taker)
    if (makerResult.reason === 'scored' || takerResult.reason === 'scored') pairs.add(pairKey)

    for (const [wallet, result, address] of [[maker, makerResult, fill.maker], [taker, takerResult, fill.taker]] as const) {
      const total = totals.get(wallet) ?? { wallet: address, seeds: 0, swaps: 0, zoomies: 0 }
      if (result.reason === 'scored') {
        perDay.set(`${wallet}:${day}`, (perDay.get(`${wallet}:${day}`) ?? 0) + 1)
        total.seeds += result.seeds
        total.swaps += 1
        if (zoomies === 'yes') total.zoomies += 1
      }
      totals.set(wallet, total)
    }
    // Only a swap that actually paid Seeds starts the cooldown of the NFTs it counted.
    if (makerResult.reason === 'scored' || takerResult.reason === 'scored') for (const asset of fresh) earnedAt.set(assetKey(asset), fill.time)

    swaps.push({ id: fill.id, time: fill.time, round: round.toString(), zoomies, nfts, counted, maker: makerResult, taker: takerResult })
  }

  const wallets = [...totals.values()].filter((w) => w.seeds > 0).sort((a, b) => b.seeds - a.seeds || b.swaps - a.swaps)
  return { swaps, wallets }
}
