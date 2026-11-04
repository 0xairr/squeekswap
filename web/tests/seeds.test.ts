import { describe, expect, it } from 'vitest'
import type { Address } from 'viem'
import { ROUNDS, roundOf, scoreSeeds, SEEDS, type Fill } from '@/lib/seeds'

const G = '0xc4c7982657f00509548f3a3a41db7fa439a6856b' as Address
const A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address
const B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address
const C = '0xcccccccccccccccccccccccccccccccccccccccc' as Address
const nft = (id: number) => ({ collection: G, tokenId: BigInt(id) })
const DAY = 86_400
// A moment safely inside round 1300 (rounds are 600 s from genesis).
const T0 = ROUNDS.genesisTimestamp + 1300 * ROUNDS.duration + 30

let n = 0
const fill = (maker: Address, taker: Address, give: number[], want: number[], time: number): Fill =>
  ({ id: String(++n), maker, taker, give: give.map(nft), want: want.map(nft), time })
const score = (fills: Fill[], active: string[] = [], settled = 10_000n) => scoreSeeds(fills, new Set(active), settled)
const seedsOf = (fills: Fill[], wallet: Address, active: string[] = []) =>
  score(fills, active).wallets.find((w) => w.wallet.toLowerCase() === wallet.toLowerCase())?.seeds ?? 0

describe('Seeds', () => {
  it('gives both wallets the base Seeds for a 1-for-1 swap', () => {
    const fills = [fill(A, B, [1], [2], T0)]
    expect(seedsOf(fills, A)).toBe(SEEDS.base)
    expect(seedsOf(fills, B)).toBe(SEEDS.base)
  })

  it('pays extra for every NFT beyond the first two in a bundle', () => {
    const fills = [fill(A, B, [1, 2, 3], [4, 5], T0)] // 5 NFTs -> 3 extra
    expect(seedsOf(fills, A)).toBe(SEEDS.base + 3 * SEEDS.perExtraNft)
    const max = [fill(A, B, [1, 2, 3, 4, 5, 6, 7, 8], [9, 10, 11, 12, 13, 14, 15, 16], T0)]
    expect(seedsOf(max, B)).toBe(SEEDS.base + 14 * SEEDS.perExtraNft)
  })

  it('doubles Seeds when Squeektoshi ran in the swap round, and waits while the round is unsettled', () => {
    const round = roundOf(T0).toString()
    expect(seedsOf([fill(A, B, [1], [2], T0)], A, [round])).toBe(SEEDS.base * SEEDS.zoomies)
    expect(seedsOf([fill(A, B, [1], [2], T0)], A, [])).toBe(SEEDS.base)
    const pending = scoreSeeds([fill(A, B, [1], [2], T0)], new Set([round]), roundOf(T0) - 1n)
    expect(pending.swaps[0].zoomies).toBe('pending')
    expect(pending.wallets[0].seeds).toBe(SEEDS.base)
  })

  it('scores at most 3 swaps per wallet per UTC day', () => {
    const others = Array.from({ length: 5 }, (_, i) => `0x${(i + 1).toString(16).padStart(40, '0')}` as Address)
    const fills = others.map((other, i) => fill(A, other, [10 + i], [20 + i], T0 + i * 60))
    const result = score(fills)
    expect(result.wallets.find((w) => w.wallet === A)?.swaps).toBe(SEEDS.dailyCap)
    expect(result.swaps.slice(3).every((s) => s.maker.reason === 'daily-cap')).toBe(true)
    // The other side of a capped swap still earns.
    expect(result.swaps[4].taker.reason).toBe('scored')
    // A new UTC day resets the cap.
    expect(score([...fills, fill(A, C, [30], [31], T0 + DAY)]).wallets.find((w) => w.wallet === A)?.swaps).toBe(SEEDS.dailyCap + 1)
  })

  it('scores each wallet pair once per UTC day', () => {
    const result = score([fill(A, B, [1], [2], T0), fill(B, A, [3], [4], T0 + 120)])
    expect(result.swaps[1].maker.reason).toBe('pair-today')
    expect(result.swaps[1].taker.reason).toBe('pair-today')
    expect(score([fill(A, B, [1], [2], T0), fill(B, A, [3], [4], T0 + DAY)]).swaps[1].maker.reason).toBe('scored')
  })

  it('gives nothing when every NFT in the swap earned Seeds in the last 3 days', () => {
    const there = fill(A, B, [1], [2], T0)
    const back = fill(A, B, [2], [1], T0 + DAY + 60) // next day, so the pair rule is not what blocks it
    const result = score([there, back])
    expect(result.swaps[1].maker.reason).toBe('cooldown')
    expect(result.swaps[1].counted).toBe(0)
    // After the 3-day cooldown the same NFTs earn again.
    const later = fill(A, B, [2], [1], T0 + SEEDS.nftCooldownSeconds + 60)
    expect(score([there, later]).swaps[1].maker.reason).toBe('scored')
  })

  it('keeps the cooldown when the NFT moves to a different person', () => {
    // A trades #1 to B for #5. Next day B passes #1 to C, and C gives back #5 (which A had sent C meanwhile).
    // Both NFTs earned yesterday, so they stay on cooldown whoever holds them now.
    const first = fill(A, B, [1], [5], T0)
    const passOn = fill(B, C, [1], [5], T0 + DAY + 60)
    expect(score([first, passOn]).swaps[1].maker.reason).toBe('cooldown')
  })

  it('stops a ring of wallets from farming the same NFTs', () => {
    const D = '0xdddddddddddddddddddddddddddddddddddddddd' as Address
    const day1 = [fill(A, B, [1], [2], T0), fill(C, D, [3], [4], T0 + 60)]
    // Day 2: every wallet now holds an NFT that earned yesterday, so swapping them around pays nothing.
    const day2 = [fill(A, C, [2], [4], T0 + DAY + 60), fill(B, D, [1], [3], T0 + DAY + 120)]
    const result = score([...day1, ...day2])
    expect(result.swaps.slice(2).every((s) => s.maker.reason === 'cooldown' && s.taker.reason === 'cooldown')).toBe(true)
  })

  it('a one-NFT holder still earns when the other side brings a fresh NFT', () => {
    const first = fill(A, B, [1], [2], T0) // A now holds #2 (on cooldown)
    const next = fill(A, C, [2], [9], T0 + DAY + 60) // #9 is fresh, so the swap scores for both
    const result = score([first, next])
    expect(result.swaps[1].counted).toBe(1)
    expect(result.swaps[1].maker.reason).toBe('scored')
  })

  it('a 5-NFT swap with one NFT on cooldown still scores, without counting that NFT', () => {
    const there = fill(A, B, [1], [2], T0)
    const bundle = fill(A, C, [2, 5, 6], [7, 8], T0 + DAY + 60) // #2 earned yesterday; #5-#8 are fresh
    const result = score([there, bundle])
    expect(result.swaps[1].counted).toBe(4)
    expect(result.swaps[1].maker.seeds).toBe(SEEDS.base + 2 * SEEDS.perExtraNft)
  })

  it('does not start a cooldown when the swap paid nothing', () => {
    // The second same-day swap between A and B is blocked by the pair rule, so its NFTs stay fresh.
    const result = score([fill(A, B, [1], [2], T0), fill(A, B, [3], [4], T0 + 60), fill(A, C, [3], [9], T0 + DAY)])
    expect(result.swaps[1].maker.reason).toBe('pair-today')
    expect(result.swaps[2].counted).toBe(2)
  })

  it('ranks wallets by Seeds', () => {
    const result = score([fill(A, B, [1, 2, 3], [4], T0), fill(C, A, [5], [6], T0 + 60)])
    expect(result.wallets[0].wallet).toBe(A)
  })
})
