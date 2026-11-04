import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { encodeAbiParameters, getAbiItem, keccak256, type Address, type Hex, type PublicClient } from 'viem'
import { squeekAbi, swapAbi } from './abis'
import type { Deployment } from './deployments'
import { same } from './format'
import { assetKey, statusOf, type Offer, type OfferStatus } from './offers'
import { fromWire, toWire, type OffersResponse, type Snapshot, type WireOffer, type WireOrphan, type WireRecord } from './wire'

// One shared index per chain on the server, so visitors never scan the desk's history themselves.
// Event logs supply offer bodies; contract storage (records, nonceOf) supplies every status and the hash
// that each body must match before it is shown.

export type ChainRecord = { hash: Hex; maker: Address; expiry: bigint; status: number }
/** `filledAt`: block timestamp (unix seconds) of the OfferFilled event, used to score Seeds. */
export type Body = { offer: Offer; filledBy: Address | null; filledAt?: number; levels?: Record<string, number> }

const OFFER_PARAMS = getAbiItem({ abi: swapAbi, name: 'create' }).inputs
const hashes = new WeakMap<Offer, Hex>()

/** keccak256(abi.encode(offer)), exactly as SqueekSwapV2 stores it in `records[id].hash`. */
export function offerHash(offer: Offer): Hex {
  let hash = hashes.get(offer)
  if (!hash) {
    hash = keccak256(encodeAbiParameters(OFFER_PARAMS, [offer]))
    hashes.set(offer, hash)
  }
  return hash
}

export function buildSnapshot(input: {
  records: Map<string, ChainRecord>
  bodies: Map<string, Body>
  nonces: Map<string, bigint>
  now: bigint
}): Snapshot {
  const offers: WireRecord[] = []
  const orphans: WireOrphan[] = []
  for (const [id, r] of input.records) {
    const found = input.bodies.get(id)
    // A body that does not hash to the stored record (reorg, bad RPC data) is never shown or offered for filling.
    const body = found && offerHash(found.offer).toLowerCase() === r.hash.toLowerCase() ? found : undefined
    if (!body) {
      // Only open orphans matter: their maker may still want to cancel them by number.
      if (r.status === 1) orphans.push({ id, maker: r.maker, expiry: r.expiry.toString(), status: statusOf(r.status, r.expiry, input.now) })
      continue
    }
    const revoked = body.offer.nonce < (input.nonces.get(r.maker.toLowerCase()) ?? 0n)
    offers.push({
      id,
      status: statusOf(r.status, r.expiry, input.now, revoked),
      filledBy: body.filledBy,
      ...(body.filledAt !== undefined ? { filledAt: body.filledAt } : {}),
      offer: toWire(body.offer),
      ...(body.levels ? { levels: body.levels } : {}),
    })
  }
  const newestFirst = (a: { id: string }, b: { id: string }) => (BigInt(b.id) > BigInt(a.id) ? 1 : -1)
  return { offers: offers.sort(newestFirst), orphans: orphans.sort(newestFirst) }
}

export type OfferQuery = { status?: OfferStatus; maker?: string; taker?: string }

/** `taker: 'any'` selects public offers. */
export function filterOffers(offers: WireRecord[], q: OfferQuery): WireRecord[] {
  return offers.filter(
    (r) =>
      (!q.status || r.status === q.status) &&
      (!q.maker || same(r.offer.maker, q.maker)) &&
      (!q.taker || (q.taker === 'any' ? /^0x0{40}$/.test(r.offer.taker) : same(r.offer.taker, q.taker))),
  )
}

// --- server side ------------------------------------------------------------------

const MIN_INTERVAL_MS = 10_000
const MIN_FORCED_MS = 2_000
/** Sepolia reorgs are shallow. The newest blocks are re-read, and final statuses re-checked, inside this window. */
export const REORG_WINDOW = 12n
const ARCHIVE_WARNING =
  'The server could not read some old desk events, so a few offers show without details. Their makers can still cancel them by number. The site owner can fix this with an archive-capable RPC.'
const staleWarning = (block: bigint) => `Live chain reads are failing right now. Offers are shown as of block ${block}; check again before acting.`

type Tracked = ChainRecord & { finalSince?: bigint }

type State = {
  bodies: Map<string, Body>
  records: Map<string, Tracked>
  nonces: Map<string, bigint>
  /** Fills whose OfferCreated body has not been read yet (for example while an old range is still a gap). */
  pendingFills: Map<string, { taker: Address; time: number }>
  /** Last block whose events are indexed, apart from `gap`. */
  lastBlock: bigint
  /** Oldest blocks the RPC refused to serve events for; retried on every refresh. */
  gap: { from: bigint; to: bigint } | null
  block: bigint
  /** Timestamp of `block`, used as "now" for expiry. */
  time: bigint
  count: bigint
  updatedAt: number
  attemptedAt: number
  failing: boolean
}

type SavedBody = { offer: WireOffer; filledBy: Address | null; filledAt?: number; levels?: Record<string, number> }
type Saved = { lastBlock: string; gap: { from: string; to: string } | null; bodies: [string, SavedBody][] }

function load(file: string | null, dep: Deployment): State {
  const empty: State = {
    bodies: new Map(), records: new Map(), nonces: new Map(), pendingFills: new Map(), lastBlock: dep.fromBlock - 1n, gap: null,
    block: 0n, time: 0n, count: 0n, updatedAt: 0, attemptedAt: 0, failing: false,
  }
  if (!file) return empty
  try {
    const saved = JSON.parse(readFileSync(file, 'utf8')) as Saved
    return {
      ...empty,
      lastBlock: BigInt(saved.lastBlock),
      gap: saved.gap && { from: BigInt(saved.gap.from), to: BigInt(saved.gap.to) },
      bodies: new Map(saved.bodies.map(([id, b]) => [id, { offer: fromWire(b.offer), filledBy: b.filledBy, ...(b.filledAt !== undefined ? { filledAt: b.filledAt } : {}), ...(b.levels ? { levels: b.levels } : {}) }])),
    }
  } catch {
    return empty
  }
}

function save(file: string | null, s: State) {
  if (!file) return
  const saved: Saved = {
    lastBlock: s.lastBlock.toString(),
    gap: s.gap && { from: s.gap.from.toString(), to: s.gap.to.toString() },
    bodies: [...s.bodies].map(([id, b]) => [id, { offer: toWire(b.offer), filledBy: b.filledBy, ...(b.filledAt !== undefined ? { filledAt: b.filledAt } : {}), ...(b.levels ? { levels: b.levels } : {}) }]),
  }
  try {
    writeFileSync(file, JSON.stringify(saved))
  } catch {
    // A read-only filesystem only costs a rescan after a restart.
  }
}

const max = (a: bigint, b: bigint) => (a > b ? a : b)

export function createIndexer(client: PublicClient, dep: Deployment, chainId: number, opts: { chunk: bigint; cacheDir: string | null }) {
  let file: string | null = null
  if (opts.cacheDir) {
    try {
      mkdirSync(opts.cacheDir, { recursive: true })
      file = join(opts.cacheDir, `offers-${chainId}-${dep.swap.toLowerCase()}.json`)
    } catch {
      file = null
    }
  }
  const state = load(file, dep)
  let inFlight: Promise<void> | null = null

  /** Genesis levels at the creation block, so the offer page can warn when a level changed before acceptance. */
  async function levelsAt(offer: Offer, blockNumber: bigint): Promise<Record<string, number> | undefined> {
    const genesis = [...offer.give, ...offer.want].filter((asset) => same(asset.collection, dep.squeeks))
    if (genesis.length === 0) return undefined
    try {
      const levels = await Promise.all(genesis.map((asset) =>
        client.readContract({ address: dep.squeeks, abi: squeekAbi, functionName: 'level', args: [asset.tokenId], blockNumber })))
      return Object.fromEntries(genesis.map((asset, i) => [assetKey(asset), Number(levels[i])]))
    } catch {
      // Historical state may be pruned on public RPCs; the warning is then simply unavailable.
      return undefined
    }
  }

  const blockTimes = new Map<bigint, number>()
  async function blockTime(blockNumber: bigint): Promise<number> {
    let time = blockTimes.get(blockNumber)
    if (time === undefined) {
      time = Number((await client.getBlock({ blockNumber })).timestamp)
      if (blockTimes.size > 5_000) blockTimes.clear()
      blockTimes.set(blockNumber, time)
    }
    return time
  }

  async function readEvents(from: bigint, to: bigint) {
    const events = await client.getContractEvents({ address: dep.swap, abi: swapAbi, fromBlock: from, toBlock: to, strict: true })
    const created: { id: string; block: bigint }[] = []
    for (const e of events) {
      if (e.eventName === 'OfferCreated') {
        const id = e.args.id.toString()
        const existing = state.bodies.get(id)
        const unchanged = !!existing && offerHash(existing.offer) === offerHash(e.args.offer)
        state.bodies.set(id, {
          offer: e.args.offer,
          filledBy: state.pendingFills.get(id)?.taker ?? (unchanged ? existing!.filledBy : null),
          ...(state.pendingFills.get(id) ? { filledAt: state.pendingFills.get(id)!.time } : unchanged && existing!.filledAt !== undefined ? { filledAt: existing!.filledAt } : {}),
          ...(unchanged && existing!.levels ? { levels: existing!.levels } : {}),
        })
        state.pendingFills.delete(id)
        if (!unchanged || !existing!.levels) created.push({ id, block: e.blockNumber })
      }
      if (e.eventName === 'OfferFilled') {
        const id = e.args.id.toString()
        const body = state.bodies.get(id)
        const time = await blockTime(e.blockNumber)
        if (body) { body.filledBy = e.args.taker; body.filledAt = time }
        else state.pendingFills.set(id, { taker: e.args.taker, time })
      }
    }
    await Promise.all(created.map(async ({ id, block }) => {
      const body = state.bodies.get(id)
      const levels = body && await levelsAt(body.offer, block)
      if (body && levels) body.levels = levels
    }))
  }

  async function refresh() {
    const head = await client.getBlock({ blockTag: 'latest' })
    const latest = head.number
    // Retry refused old blocks first, one chunk per refresh while they keep failing.
    while (state.gap) {
      const to = state.gap.from + opts.chunk - 1n < state.gap.to ? state.gap.from + opts.chunk - 1n : state.gap.to
      try {
        await readEvents(state.gap.from, to)
      } catch {
        break
      }
      state.gap = to >= state.gap.to ? null : { from: to + 1n, to: state.gap.to }
    }
    // Re-read the newest blocks every time, so an event body replaced by a shallow reorg is picked up again.
    const start = max(dep.fromBlock, state.lastBlock + 1n - REORG_WINDOW)
    for (let from = start; from <= latest; from += opts.chunk) {
      const to = from + opts.chunk - 1n < latest ? from + opts.chunk - 1n : latest
      try {
        await readEvents(from, to)
      } catch (error) {
        if (from <= state.lastBlock) throw error // re-reading already-indexed blocks failed: retry next refresh
        // Public RPCs refuse events older than about a day. Remember the range and keep indexing newer blocks.
        if (state.gap && state.gap.to + 1n === from) state.gap.to = to
        else if (!state.gap) state.gap = { from, to }
        else throw error
      }
      state.lastBlock = max(state.lastBlock, to)
    }

    const count = await client.readContract({ address: dep.swap, abi: swapAbi, functionName: 'offerCount', blockNumber: latest })
    const stale: bigint[] = []
    for (let id = 1n; id <= count; id++) {
      const known = state.records.get(id.toString())
      // Filled and closed are final only once they have stayed so for a full reorg window.
      const settled = known && known.status !== 1 && known.finalSince !== undefined && latest - known.finalSince >= REORG_WINDOW
      if (!settled) stale.push(id)
    }
    const rows = await Promise.all(
      stale.map((id) => client.readContract({ address: dep.swap, abi: swapAbi, functionName: 'records', args: [id], blockNumber: latest })),
    )
    stale.forEach((id, i) => {
      const [hash, maker, expiry, status] = rows[i]
      const prev = state.records.get(id.toString())
      const finalSince = status === 1 ? undefined : prev && prev.status === status && prev.finalSince !== undefined ? prev.finalSince : latest
      state.records.set(id.toString(), { hash, maker, expiry, status, finalSince })
    })
    // Seeds need each fill's time. A filled offer whose body lacks it (older cache, missed event) gets a
    // targeted lookup of its own OfferFilled event, a few per refresh, instead of being dropped from Seeds.
    const untimed = [...state.records].filter(([id, r]) => r.status === 2 && state.bodies.get(id) && state.bodies.get(id)!.filledAt === undefined).slice(0, 10)
    for (const [id] of untimed) {
      try {
        const logs = await client.getContractEvents({ address: dep.swap, abi: swapAbi, eventName: 'OfferFilled', args: { id: BigInt(id) }, fromBlock: dep.fromBlock, toBlock: latest, strict: true })
        const log = logs.at(-1)
        const body = state.bodies.get(id)
        if (log && body) {
          body.filledBy = log.args.taker
          body.filledAt = await blockTime(log.blockNumber)
        }
      } catch {
        // An RPC that refuses old ranges leaves it for the next refresh.
      }
    }

    const makers = [...new Set([...state.records.values()].filter((r) => r.status === 1).map((r) => r.maker.toLowerCase()))]
    const nonces = await Promise.all(
      makers.map((m) => client.readContract({ address: dep.swap, abi: swapAbi, functionName: 'nonceOf', args: [m as Address], blockNumber: latest })),
    )
    makers.forEach((m, i) => state.nonces.set(m, nonces[i]))
    state.block = latest
    state.time = head.timestamp
    state.count = count
    state.updatedAt = Date.now()
    state.failing = false
    save(file, state)
  }

  return {
    /** `maxAgeMs` lets a caller that knows the index is behind (a brand-new offer) ask for a fresher read. */
    async get(opts: { maxAgeMs?: number } = {}): Promise<OffersResponse> {
      // Throttle on the last attempt, not the last success, so an RPC outage is not hammered by every visitor.
      if (Date.now() - state.attemptedAt > Math.max(opts.maxAgeMs ?? MIN_INTERVAL_MS, MIN_FORCED_MS)) {
        if (!inFlight) {
          state.attemptedAt = Date.now()
          inFlight = refresh().finally(() => (inFlight = null))
        }
        try {
          await inFlight
        } catch (error) {
          state.failing = true
          if (state.updatedAt === 0) throw error // nothing to serve yet
        }
      } else if (inFlight) {
        await inFlight.catch(() => undefined)
      }
      // Never present an empty book as real when no refresh has ever succeeded.
      if (state.updatedAt === 0) throw new Error('The offer index has not loaded yet.')
      return {
        chainId,
        swap: dep.swap,
        block: state.block.toString(),
        offerCount: state.count.toString(),
        complete: state.gap === null,
        stale: state.failing,
        warning: state.gap ? ARCHIVE_WARNING : state.failing ? staleWarning(state.block) : null,
        ...buildSnapshot({ records: state.records, bodies: state.bodies, nonces: state.nonces, now: state.time }),
      }
    },
  }
}
