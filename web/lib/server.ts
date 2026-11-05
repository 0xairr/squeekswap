import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPublicClient, fallback, http, type Chain, type PublicClient } from 'viem'
import { foundry, mainnet, sepolia } from 'viem/chains'
import { createClaimIndexer } from './claims'
import { CANONICAL_DISPENSER, deploymentFor } from './deployments'
import { createIndexer } from './indexer'
import { createRoundIndexer } from './rounds'

// Server-only. These RPC URLs never reach the browser, so a keyed archive endpoint is safe here.
// publicnode's Sepolia keeps only ~10,000 blocks (~1.4 days) of logs and answers older eth_getLogs with
// "pruned history unavailable". Requests it refuses fall through to Tenderly's public gateway, which keeps the
// full history that the offer, wheel-round and claim readers scan from SqueekSwap V2's deployment block.
const CHAINS: Record<number, { chain: Chain; rpc: () => string; history?: string }> = {
  1: { chain: mainnet, rpc: () => process.env.MAINNET_RPC_URL || 'https://ethereum-rpc.publicnode.com' },
  11155111: { chain: sepolia, rpc: () => process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com', history: 'https://sepolia.gateway.tenderly.co' },
  31337: { chain: foundry, rpc: () => process.env.LOCAL_RPC_URL || 'http://127.0.0.1:8545' },
}

const clients = new Map<number, PublicClient>()
const indexers = new Map<number, ReturnType<typeof createIndexer>>()
const roundIndexers = new Map<number, ReturnType<typeof createRoundIndexer>>()
const claimIndexers = new Map<number, ReturnType<typeof createClaimIndexer>>()

export function serverClient(chainId: number): PublicClient | null {
  const entry = CHAINS[chainId]
  if (!entry || !deploymentFor(chainId)) return null
  let client = clients.get(chainId)
  if (!client) {
    const primary = http(entry.rpc(), { batch: true })
    const transport = entry.history ? fallback([primary, http(entry.history, { batch: true })]) : primary
    client = createPublicClient({ chain: entry.chain, transport }) as PublicClient
    clients.set(chainId, client)
  }
  return client
}

export function indexerFor(chainId: number) {
  const client = serverClient(chainId)
  const dep = deploymentFor(chainId)
  if (!client || !dep) return null
  let indexer = indexers.get(chainId)
  if (!indexer) {
    indexer = createIndexer(client, dep, chainId, {
      chunk: BigInt(process.env.LOG_CHUNK || 10_000),
      // Serverless hosts (Vercel) only allow writes under /tmp; elsewhere keep the cache beside the app.
      cacheDir: process.env.INDEX_CACHE_DIR || (process.env.VERCEL ? join(tmpdir(), 'squeekswap-index') : join(process.cwd(), '.cache')),
    })
    indexers.set(chainId, indexer)
  }
  return indexer
}


/** Squeektoshi's wheel rounds (SqueekCore on Sepolia), read from SqueekSwap V2's deployment block onward. */
export function roundsFor(chainId: number) {
  const client = serverClient(chainId)
  const dep = deploymentFor(chainId)
  if (!client || !dep || chainId !== 11155111) return null
  let rounds = roundIndexers.get(chainId)
  if (!rounds) {
    rounds = createRoundIndexer(client, dep.fromBlock, BigInt(process.env.LOG_CHUNK || 10_000))
    roundIndexers.set(chainId, rounds)
  }
  return rounds
}

/** Genesis NFTs handed out by Squeekchain's Sepolia test dispenser, newest claim first. */
export function claimsFor(chainId: number) {
  const client = serverClient(chainId)
  const dep = deploymentFor(chainId)
  if (!client || !dep || chainId !== 11155111) return null
  let claims = claimIndexers.get(chainId)
  if (!claims) {
    claims = createClaimIndexer(client, dep.squeeks, CANONICAL_DISPENSER, dep.fromBlock, BigInt(process.env.LOG_CHUNK || 10_000))
    claimIndexers.set(chainId, claims)
  }
  return claims
}
