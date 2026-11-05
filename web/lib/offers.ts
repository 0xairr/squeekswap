import { type Address, zeroAddress } from 'viem'
import { same } from './format'
import type { Custody } from './nfts'

export const MAX_ITEMS = 8
export const EXPIRY_DAYS = [1, 7, 30] as const
export type ExpiryDays = (typeof EXPIRY_DAYS)[number]
export type Asset = { collection: Address; tokenId: bigint }
export type Offer = { maker: Address; taker: Address; expiry: bigint; nonce: bigint; give: readonly Asset[]; want: readonly Asset[] }
export type DraftAsset = Asset & { owner: Address | null; custody: Custody }
export type Draft = {
  maker: Address
  give: DraftAsset[]
  want: DraftAsset[]
  privateTaker: boolean
  expiryDays: ExpiryDays
  nowSeconds: bigint
  nonce: bigint
}

export const assetKey = (asset: Asset): string => `${asset.collection.toLowerCase()}:${asset.tokenId}`
export const sameAsset = (a: Asset, b: Asset): boolean => same(a.collection, b.collection) && a.tokenId === b.tokenId

export function validateDraft(draft: Draft): string | null {
  if (draft.give.length === 0) return 'Pick at least one NFT to give.'
  if (draft.want.length === 0) return 'Add at least one NFT you want.'
  if (draft.give.length > MAX_ITEMS || draft.want.length > MAX_ITEMS) return `Up to ${MAX_ITEMS} NFTs on each side.`
  const giveKeys = draft.give.map(assetKey)
  const wantKeys = draft.want.map(assetKey)
  if (new Set(giveKeys).size !== giveKeys.length || new Set(wantKeys).size !== wantKeys.length) return 'Each NFT can appear only once.'
  if (giveKeys.some((key) => wantKeys.includes(key))) return 'The same NFT cannot be on both sides.'
  const notMine = draft.give.find((x) => !same(x.owner, draft.maker))
  if (notMine) return `You do not hold token #${notMine.tokenId} from ${notMine.collection}.`
  const staked = draft.give.find((x) => x.custody === 'staking')
  if (staked) return `Withdraw Squeek #${staked.tokenId} from staking before offering it.`
  const missing = draft.want.find((x) => !x.owner)
  if (missing) return `Token #${missing.tokenId} does not exist in ${missing.collection}.`
  const unclaimed = draft.want.find((x) => x.custody === 'unclaimed')
  if (unclaimed) return `Squeek #${unclaimed.tokenId} has not been claimed yet. Only claimed Squeeks can be traded.`
  const owner = draft.want[0].owner
  if (draft.want.some((x) => !same(x.owner, owner))) return 'All wanted NFTs must belong to one wallet.'
  if (same(owner, draft.maker)) return 'You already hold the NFTs you want.'
  if (draft.want.some((x) => x.custody === 'staking')) return 'A wanted Squeek is staked. Its depositor must withdraw it before this swap can fill.'
  return null
}

export function buildOffer(draft: Draft): Offer {
  const error = validateDraft(draft)
  if (error) throw new Error(error)
  return {
    maker: draft.maker,
    taker: draft.privateTaker ? (draft.want[0].owner as Address) : zeroAddress,
    expiry: draft.nowSeconds + BigInt(draft.expiryDays) * 86400n,
    nonce: draft.nonce,
    give: draft.give.map(({ collection, tokenId }) => ({ collection, tokenId })),
    want: draft.want.map(({ collection, tokenId }) => ({ collection, tokenId })),
  }
}

export const REASONS = [
  'Ready to swap.',
  'This offer is no longer open.',
  'This offer changed. Reload the page.',
  'This offer has expired.',
  'The maker withdrew all their offers, including this one.',
  'This offer is for a different wallet.',
  'A collection in this offer is no longer supported.',
  'Your wallet does not hold every NFT this offer asks for.',
  'Approve each requested NFT first.',
  'The maker no longer holds every offered NFT.',
  'The maker must approve each offered NFT again.',
] as const

export function listableForTaker(reason: number): boolean { return reason === 0 || reason === 8 }
export function reasonText(code: number): string { return REASONS[code] ?? `Unknown contract result (${code}).` }
export type OfferStatus = 'open' | 'expired' | 'filled' | 'closed' | 'revoked'
type Listed = { offer: Offer; status: OfferStatus }

/** True when the asset belongs to the one collection this website supports: official Squeek Genesis. */
export const isOfficial = (asset: Asset, official: Address): boolean => same(asset.collection, official)
/** Every asset in the offer that is not official Squeek Genesis. The website refuses to accept such offers. */
export const unofficialAssets = (offer: Offer, official: Address): Asset[] => [...offer.give, ...offer.want].filter((asset) => !isOfficial(asset, official))

/**
 * `toMe`: open offers this wallet could accept — offers that name it, plus public offers whose every wanted
 * NFT is in `held` (asset keys of wallet-custody holdings). Offers with non-Genesis assets never qualify.
 * `mine`: the wallet's own open or revoked offers, so it can still cancel them.
 */
export function splitOffers<T extends Listed>(records: T[], me?: string, opts: { official?: Address; held?: ReadonlySet<string> } = {}): { toMe: T[]; mine: T[] } {
  if (!me) return { toMe: [], mine: [] }
  const official = (r: T) => !opts.official || unofficialAssets(r.offer, opts.official).length === 0
  const forMe = (r: T) => same(r.offer.taker, me)
    || (same(r.offer.taker, zeroAddress) && !same(r.offer.maker, me) && !!opts.held && r.offer.want.every((asset) => opts.held!.has(assetKey(asset))))
  return {
    toMe: records.filter((r) => r.status === 'open' && forMe(r) && official(r)),
    mine: records.filter((r) => (r.status === 'open' || r.status === 'revoked') && same(r.offer.maker, me)),
  }
}

export function statusOf(recordStatus: number, expiry: bigint, nowSeconds: bigint, revoked = false): OfferStatus {
  if (recordStatus === 2) return 'filled'
  if (recordStatus === 3) return 'closed'
  if (expiry < nowSeconds) return 'expired'
  return revoked ? 'revoked' : 'open'
}
