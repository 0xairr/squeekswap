import type { Address } from 'viem'
import type { Asset, Offer, OfferStatus } from './offers'

export type WireAsset = { collection: Address; tokenId: string }
export type WireOffer = { maker: Address; taker: Address; expiry: string; nonce: string; give: WireAsset[]; want: WireAsset[] }
/** `levels`: Genesis level of each asset (by assetKey) when the offer was created, when the indexer could read it. */
export type WireRecord = { id: string; status: OfferStatus; filledBy: Address | null; filledAt?: number; offer: WireOffer; levels?: Record<string, number> }
export type WireOrphan = { id: string; maker: Address; expiry: string; status: OfferStatus }
export type Snapshot = { offers: WireRecord[]; orphans: WireOrphan[] }
/** `stale`: the last chain refresh failed and this is the previous snapshot. `offerCount`: offers created onchain. */
export type OffersResponse = Snapshot & { chainId: number; swap: Address; block: string; offerCount: string; complete: boolean; stale: boolean; warning: string | null }

export function toWire(offer: Offer): WireOffer {
  const asset = (item: Asset): WireAsset => ({ collection: item.collection, tokenId: item.tokenId.toString() })
  return { ...offer, expiry: offer.expiry.toString(), nonce: offer.nonce.toString(), give: offer.give.map(asset), want: offer.want.map(asset) }
}

export function fromWire(wire: WireOffer): Offer {
  const asset = (item: WireAsset): Asset => ({ collection: item.collection, tokenId: BigInt(item.tokenId) })
  return { ...wire, expiry: BigInt(wire.expiry), nonce: BigInt(wire.nonce), give: wire.give.map(asset), want: wire.want.map(asset) }
}
