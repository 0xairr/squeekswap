import { describe, expect, it } from 'vitest'
import type { Address, Hex } from 'viem'
import { buildSnapshot, offerHash, type Body, type ChainRecord } from '@/lib/indexer'
import type { Offer } from '@/lib/offers'

const maker = '0x1111111111111111111111111111111111111111' as Address
const offer: Offer = {
  maker,
  taker: '0x2222222222222222222222222222222222222222',
  expiry: 605800n,
  nonce: 3n,
  give: [{ collection: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', tokenId: 1n }],
  want: [{ collection: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', tokenId: 2n }],
}
// Same vector as SqueekSwapV2.unit.t.sol test_OfferHashMatchesWebIndexerVector (Solidity abi.encode).
const SOLIDITY_HASH = '0x963531fadb5e482d05a91bfe0d2e1ac90ea40934b9ab985cb1942a2ba5238fca' as Hex

const record = (patch: Partial<ChainRecord> = {}): ChainRecord => ({ hash: SOLIDITY_HASH, maker, expiry: 605800n, status: 1, ...patch })
const snapshot = (records: [string, ChainRecord][], bodies: [string, Body][], nonces: [string, bigint][] = [], now = 1000n) =>
  buildSnapshot({ records: new Map(records), bodies: new Map(bodies), nonces: new Map(nonces), now })

describe('offer index', () => {
  it('hashes an offer exactly like the contract stores it', () => {
    expect(offerHash(offer)).toBe(SOLIDITY_HASH)
  })
  it('shows a body only when it matches the stored record hash', () => {
    const ok = snapshot([['1', record()]], [['1', { offer, filledBy: null }]])
    expect(ok.offers.map((r) => r.id)).toEqual(['1'])
    expect(ok.orphans).toEqual([])

    const replaced = { ...offer, give: [{ ...offer.give[0], tokenId: 9n }] }
    const bad = snapshot([['1', record()]], [['1', { offer: replaced, filledBy: null }]])
    expect(bad.offers).toEqual([])
    expect(bad.orphans.map((o) => o.id)).toEqual(['1'])
  })
  it('marks offers older than the maker nonce as revoked, and expiry by chain time', () => {
    expect(snapshot([['1', record()]], [['1', { offer, filledBy: null }]], [[maker, 4n]]).offers[0].status).toBe('revoked')
    expect(snapshot([['1', record()]], [['1', { offer, filledBy: null }]], [], 605801n).offers[0].status).toBe('expired')
  })
  it('passes the levels recorded at creation through to clients', () => {
    const levels = { '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:1': 3 }
    expect(snapshot([['1', record()]], [['1', { offer, filledBy: null, levels }]]).offers[0].levels).toEqual(levels)
  })
  it('keeps filled and closed records out of the orphan list', () => {
    expect(snapshot([['1', record({ status: 2 })], ['2', record({ status: 3 })]], []).orphans).toEqual([])
  })
})
