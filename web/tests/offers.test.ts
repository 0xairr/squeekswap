import { describe, expect, it } from 'vitest'
import { zeroAddress, type Address } from 'viem'
import { assetKey, buildOffer, draftKey, isOfficial, listableForTaker, reasonText, splitOffers, statusOf, unofficialAssets, validateDraft, type Draft, type Offer } from '@/lib/offers'

const maker = '0x1111111111111111111111111111111111111111' as Address
const taker = '0x2222222222222222222222222222222222222222' as Address
const collectionA = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address
const collectionB = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address
const draft = (patch: Partial<Draft> = {}): Draft => ({
  maker,
  give: [{ collection: collectionA, tokenId: 1n, owner: maker, custody: 'wallet' }],
  want: [{ collection: collectionB, tokenId: 2n, owner: taker, custody: 'wallet' }],
  privateTaker: true,
  expiryDays: 7,
  nowSeconds: 1000n,
  nonce: 3n,
  ...patch,
})

describe('Squeek offer drafts', () => {
  it('builds the exact compact contract tuple', () => {
    expect(buildOffer(draft())).toEqual({ maker, taker, expiry: 605800n, nonce: 3n, give: [{ collection: collectionA, tokenId: 1n }], want: [{ collection: collectionB, tokenId: 2n }] })
    expect(buildOffer(draft({ privateTaker: false })).taker).toBe(zeroAddress)
  })
  it('rejects empty, duplicate, self-owned, and staked bundles', () => {
    expect(validateDraft(draft({ give: [] }))).toMatch(/at least one/i)
    expect(validateDraft(draft({ want: [{ collection: collectionA, tokenId: 1n, owner: taker, custody: 'wallet' }] }))).toMatch(/both sides/i)
    expect(validateDraft(draft({ want: [{ collection: collectionB, tokenId: 2n, owner: maker, custody: 'wallet' }] }))).toMatch(/already hold/i)
    expect(validateDraft(draft({ give: [{ collection: collectionA, tokenId: 1n, owner: maker, custody: 'staking' }] }))).toMatch(/Withdraw/i)
  })
  it('keys a draft by its selection, not by pick order or side swaps', () => {
    const a = { collection: collectionA, tokenId: 1n }
    const b = { collection: collectionA, tokenId: 2n }
    const c = { collection: collectionB, tokenId: 3n }
    expect(draftKey([a, b], [c])).toBe(draftKey([b, a], [c]))
    expect(draftKey([a], [c])).not.toBe(draftKey([a, b], [c]))
    expect(draftKey([a], [c])).not.toBe(draftKey([c], [a]))
  })
  it('refuses to want a Squeek that is still in the claim dispenser', () => {
    const dispenser = '0xe78b4420ce205b8864f2f326f3181f9dd5ea8b5f' as Address
    expect(validateDraft(draft({ want: [{ collection: collectionB, tokenId: 420n, owner: dispenser, custody: 'unclaimed' }] }))).toMatch(/not been claimed/i)
  })
  it('maps contract reasons and statuses', () => {
    expect(listableForTaker(0)).toBe(true)
    expect(listableForTaker(8)).toBe(true)
    expect(listableForTaker(7)).toBe(false)
    expect(reasonText(9)).toMatch(/maker/i)
    expect(statusOf(1, 100n, 99n, true)).toBe('revoked')
    expect(statusOf(1, 100n, 101n)).toBe('expired')
    expect(statusOf(2, 0n, 1n)).toBe('filled')
  })
})

describe('official Genesis scope and inbox', () => {
  const me = '0x3333333333333333333333333333333333333333' as Address
  const offerFor = (patch: Partial<Offer>): Offer => ({ maker, taker: zeroAddress, expiry: 10n, nonce: 0n, give: [{ collection: collectionA, tokenId: 1n }], want: [{ collection: collectionA, tokenId: 7n }], ...patch })
  const held = new Set([assetKey({ collection: collectionA, tokenId: 7n })])

  it('flags every asset outside the official collection, ignoring address case', () => {
    expect(isOfficial({ collection: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', tokenId: 1n }, collectionA)).toBe(true)
    expect(unofficialAssets(offerFor({ give: [{ collection: collectionB, tokenId: 1n }] }), collectionA)).toEqual([{ collection: collectionB, tokenId: 1n }])
    expect(unofficialAssets(offerFor({}), collectionA)).toEqual([])
  })
  it('puts public offers that want my wallet-held Genesis into my inbox', () => {
    const records = [{ offer: offerFor({}), status: 'open' as const }]
    expect(splitOffers(records, me, { official: collectionA, held }).toMe).toHaveLength(1)
    expect(splitOffers(records, me, { official: collectionA, held: new Set() }).toMe).toHaveLength(0)
  })
  it('never lists offers with unofficial NFTs as offers to me, even when they name me', () => {
    const records = [{ offer: offerFor({ taker: me, give: [{ collection: collectionB, tokenId: 1n }] }), status: 'open' as const }]
    expect(splitOffers(records, me, { official: collectionA, held }).toMe).toEqual([])
  })
  it('keeps my own public offers out of my inbox but in my outbox', () => {
    const records = [{ offer: offerFor({ maker: me }), status: 'open' as const }]
    expect(splitOffers(records, me, { official: collectionA, held }).toMe).toEqual([])
    expect(splitOffers(records, me, { official: collectionA, held }).mine).toHaveLength(1)
  })
})
