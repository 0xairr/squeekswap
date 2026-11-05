import type { Address, PublicClient } from 'viem'
import { erc721Abi, squeekAbi, swapAbi } from './abis'
import { CANONICAL_DISPENSER, type Deployment } from './deployments'
import { same } from './format'
import type { Asset } from './offers'
import { genesisImagePath, revertedAsNull } from './reads'

/** Where an NFT sits. `unclaimed`: still in Squeekchain's test dispenser, so nobody can trade it yet. */
export type Custody = 'wallet' | 'staking' | 'unclaimed' | 'unknown'
export type CollectionInfo = { address: Address; name: string; symbol: string; supported: boolean; primary: boolean }
export type NftInfo = Asset & {
  owner: Address | null
  name: string
  symbol: string
  image: string | null
  custody: Custody
  level: number | null
  mergeState: string | null
}

export function genesisCustody(owner: Address | null, dep: Deployment): Custody {
  if (!owner) return 'unknown'
  if (same(owner, dep.staking)) return 'staking'
  if (same(owner, CANONICAL_DISPENSER)) return 'unclaimed'
  return 'wallet'
}

const TRUSTED_METADATA_HOSTS = new Set([
  'api.squeekchain.com',
  'ipfs.io',
  'cloudflare-ipfs.com',
  'nftstorage.link',
  'arweave.net',
])

function gatewayUrl(value: string): string | null {
  if (value.startsWith('ipfs://')) {
    const path = value.slice(7).replace(/^ipfs\//, '')
    return /^[A-Za-z0-9._~!$&'()*+,;=:@/?%-]+$/.test(path) ? `https://ipfs.io/ipfs/${path}` : null
  }
  if (value.startsWith('ar://')) {
    const id = value.slice(5)
    return /^[A-Za-z0-9_-]+$/.test(id) ? `https://arweave.net/${id}` : null
  }
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || !TRUSTED_METADATA_HOSTS.has(url.hostname.toLowerCase())) return null
    return url.toString()
  } catch {
    return null
  }
}

function safeImage(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 16_384) return null
  if (/^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(value) && value.length <= 2_000_000) return value
  return gatewayUrl(value)
}

function inlineJson(uri: string): unknown | null {
  try {
    if (uri.startsWith('data:application/json;base64,') && uri.length <= 200_000) {
      return JSON.parse(atob(uri.slice('data:application/json;base64,'.length)))
    }
    if (uri.startsWith('data:application/json;utf8,') && uri.length <= 200_000) {
      return JSON.parse(decodeURIComponent(uri.slice('data:application/json;utf8,'.length)))
    }
  } catch {}
  return null
}

async function metadataImage(tokenUri: string): Promise<string | null> {
  let metadata = inlineJson(tokenUri)
  if (!metadata) {
    const url = gatewayUrl(tokenUri)
    if (!url) return null
    try {
      // A redirect could leave the trusted-host allowlist, so redirects are refused.
      const response = await fetch(url, { credentials: 'omit', redirect: 'error', headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8_000) })
      if (!response.ok) return null
      const text = await response.text()
      if (text.length > 200_000) return null
      metadata = JSON.parse(text)
    } catch {
      return null
    }
  }
  if (!metadata || typeof metadata !== 'object') return null
  return safeImage((metadata as { image?: unknown; image_url?: unknown }).image ?? (metadata as { image_url?: unknown }).image_url)
}

async function textRead(client: PublicClient, collection: Address, functionName: 'name' | 'symbol'): Promise<string> {
  try {
    const value = await client.readContract({ address: collection, abi: erc721Abi, functionName })
    return value.slice(0, 80)
  } catch {
    return functionName === 'name' ? 'ERC-721 collection' : 'NFT'
  }
}

export async function readCollections(client: PublicClient, dep: Deployment): Promise<CollectionInfo[]> {
  const count = await client.readContract({ address: dep.swap, abi: swapAbi, functionName: 'collectionCount' })
  const rows = await Promise.all(Array.from({ length: Number(count) }, (_, index) =>
    client.readContract({ address: dep.swap, abi: swapAbi, functionName: 'collectionAt', args: [BigInt(index)] }),
  ))
  return Promise.all(rows.filter(([, supported]) => supported).map(async ([address, supported]) => ({
    address,
    name: await textRead(client, address, 'name'),
    symbol: await textRead(client, address, 'symbol'),
    supported,
    primary: same(address, dep.squeeks),
  })))
}

export async function readNft(client: PublicClient, dep: Deployment, asset: Asset): Promise<NftInfo> {
  const [name, symbol] = await Promise.all([textRead(client, asset.collection, 'name'), textRead(client, asset.collection, 'symbol')])
  if (same(asset.collection, dep.squeeks)) {
    const [owner, rawLevel] = await Promise.all([
      revertedAsNull(client.readContract({ address: dep.squeeks, abi: squeekAbi, functionName: 'ownerOf', args: [asset.tokenId] })),
      revertedAsNull(client.readContract({ address: dep.squeeks, abi: squeekAbi, functionName: 'level', args: [asset.tokenId] })),
    ])
    const level = rawLevel === null ? null : Number(rawLevel)
    return {
      ...asset,
      owner,
      name,
      symbol,
      image: genesisImagePath(asset.tokenId, level),
      custody: genesisCustody(owner, dep),
      level,
      mergeState: null,
    }
  }
  const [owner, tokenUri] = await Promise.all([
    revertedAsNull(client.readContract({ address: asset.collection, abi: erc721Abi, functionName: 'ownerOf', args: [asset.tokenId] })),
    client.readContract({ address: asset.collection, abi: erc721Abi, functionName: 'tokenURI', args: [asset.tokenId] }).catch(() => ''),
  ])
  return {
    ...asset,
    owner,
    name,
    symbol,
    image: tokenUri ? await metadataImage(tokenUri) : null,
    custody: owner ? 'wallet' : 'unknown',
    level: null,
    mergeState: null,
  }
}
