import { type Address, type Log, parseEventLogs } from 'viem'
import { swapAbi } from './abis'
import type { Offer, OfferStatus } from './offers'
import { loadHoldings, type Holding } from './squeekchain'
import { fromWire, type OffersResponse, type WireRecord } from './wire'

/** `filledAt`: unix seconds of the swap, set once a filled offer's block time is known. */
export type OfferRecord = { id: bigint; offer: Offer; status: OfferStatus; filledBy: Address | null; filledAt?: number; levels: Record<string, number> }
export type Orphan = { id: bigint; maker: Address; expiry: bigint; status: OfferStatus }
export type OfferList = { records: OfferRecord[]; orphans: Orphan[]; warning: string | null }

const toRecord = (record: WireRecord): OfferRecord => ({ id: BigInt(record.id), offer: fromWire(record.offer), status: record.status, filledBy: record.filledBy, ...(record.filledAt !== undefined ? { filledAt: record.filledAt } : {}), levels: record.levels ?? {} })

async function getJson<T>(url: string): Promise<{ ok: boolean; status: number; body: T & { error?: string } }> {
  const response = await fetch(url)
  return { ok: response.ok, status: response.status, body: await response.json() }
}

// /api/offers is cached at the CDN and in the server's index for several seconds, so right after a cancel or a
// swap it can still say "open". For a short while after this browser confirms a transaction, offer reads ask for
// a fresh index instead.
const FRESH_MS = 20_000
let freshUntil = 0
export function readOffersFresh() { freshUntil = Date.now() + FRESH_MS }
const fresh = (separator: '?' | '&') => (Date.now() < freshUntil ? `${separator}fresh=1` : '')

export async function fetchOffers(chainId: number): Promise<OfferList> {
  const { ok, body } = await getJson<OffersResponse>(`/api/offers?chainId=${chainId}${fresh('&')}`)
  if (!ok) throw new Error(body.error ?? 'Could not load offers.')
  return {
    records: body.offers.map(toRecord),
    orphans: body.orphans.map((o) => ({ id: BigInt(o.id), maker: o.maker, expiry: BigInt(o.expiry), status: o.status })),
    warning: body.warning,
  }
}

export async function fetchOffer(chainId: number, id: bigint): Promise<OfferRecord | null> {
  const { ok, status, body } = await getJson<{ record: WireRecord }>(`/api/offers/${chainId}/${id}${fresh('?')}`)
  if (status === 404) return null
  if (!ok) throw new Error(body.error ?? 'Could not load this offer.')
  return toRecord(body.record)
}

export { loadHoldings }
export type { Holding }

export function offerIdFromLogs(logs: Log[]): bigint | null {
  const created = parseEventLogs({ abi: swapAbi, eventName: 'OfferCreated', logs })
  return created[0]?.args.id ?? null
}
