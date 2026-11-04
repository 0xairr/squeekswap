import { type Address, type Log, parseEventLogs } from 'viem'
import { swapAbi } from './abis'
import type { Offer, OfferStatus } from './offers'
import { loadHoldings, type Holding } from './squeekchain'
import { fromWire, type OffersResponse, type WireRecord } from './wire'

export type OfferRecord = { id: bigint; offer: Offer; status: OfferStatus; filledBy: Address | null; levels: Record<string, number> }
export type Orphan = { id: bigint; maker: Address; expiry: bigint; status: OfferStatus }
export type OfferList = { records: OfferRecord[]; orphans: Orphan[]; warning: string | null }

const toRecord = (record: WireRecord): OfferRecord => ({ id: BigInt(record.id), offer: fromWire(record.offer), status: record.status, filledBy: record.filledBy, levels: record.levels ?? {} })

async function getJson<T>(url: string): Promise<{ ok: boolean; status: number; body: T & { error?: string } }> {
  const response = await fetch(url)
  return { ok: response.ok, status: response.status, body: await response.json() }
}

export async function fetchOffers(chainId: number): Promise<OfferList> {
  const { ok, body } = await getJson<OffersResponse>(`/api/offers?chainId=${chainId}`)
  if (!ok) throw new Error(body.error ?? 'Could not load offers.')
  return {
    records: body.offers.map(toRecord),
    orphans: body.orphans.map((o) => ({ id: BigInt(o.id), maker: o.maker, expiry: BigInt(o.expiry), status: o.status })),
    warning: body.warning,
  }
}

export async function fetchOffer(chainId: number, id: bigint): Promise<OfferRecord | null> {
  const { ok, status, body } = await getJson<{ record: WireRecord }>(`/api/offers/${chainId}/${id}`)
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
