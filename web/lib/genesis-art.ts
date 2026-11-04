import { parseAbi } from 'viem'
import { deploymentFor, SQUEEK_CHAIN_ID } from './deployments'
import { serverClient } from './server'

// Genesis artwork straight from the chain: the official contract's tokenURI is an inline JSON data URI whose
// `image` is the full SVG. Reading it over RPC works from any host (Squeekchain's web API bot-challenges cloud
// servers), and it is the authoritative source anyway.

const abi = parseAbi(['function tokenURI(uint256 tokenId) view returns (string)'])
const TTL_MS = 10 * 60_000
const READ_SLOTS = 6

type Entry = { at: number; value: Promise<string | null> }
const shared = globalThis as typeof globalThis & { __genesisArt?: Map<string, Entry> }
const cache = shared.__genesisArt ??= new Map()

let active = 0
const waiting: Array<() => void> = []
async function slot<T>(work: () => Promise<T>): Promise<T> {
  if (active >= READ_SLOTS) await new Promise<void>((resolve) => waiting.push(resolve))
  active++
  try {
    return await work()
  } finally {
    active--
    waiting.shift()?.()
  }
}

/** The `image` field of a tokenURI, or null when it is not an inline image data URI. */
export function imageFromTokenUri(uri: string): string | null {
  let metadata: unknown = null
  try {
    if (uri.startsWith('data:application/json;base64,')) metadata = JSON.parse(Buffer.from(uri.slice(29), 'base64').toString('utf8'))
    else if (uri.startsWith('data:application/json')) metadata = JSON.parse(decodeURIComponent(uri.slice(uri.indexOf(',') + 1)))
  } catch {
    return null
  }
  const image = metadata && typeof metadata === 'object' ? (metadata as { image?: unknown }).image : null
  return typeof image === 'string' && /^data:image\/[a-z0-9.+-]+;base64,/i.test(image) ? image : null
}

/** The artwork data URI of Genesis token `id`, read onchain and cached for ten minutes. */
export function genesisArtwork(id: string): Promise<string | null> {
  const hit = cache.get(id)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value
  const client = serverClient(SQUEEK_CHAIN_ID)
  const deployment = deploymentFor(SQUEEK_CHAIN_ID)
  if (!client || !deployment) return Promise.resolve(null)
  if (cache.size >= 2_000) cache.delete(cache.keys().next().value!)
  const value = slot(() => client.readContract({ address: deployment.squeeks, abi, functionName: 'tokenURI', args: [BigInt(id)] }))
    .then(imageFromTokenUri)
  value.catch(() => cache.delete(id))
  cache.set(id, { at: Date.now(), value })
  return value
}
