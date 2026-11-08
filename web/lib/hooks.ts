'use client'

import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { Address, Hex, PublicClient, TransactionReceipt } from 'viem'
import { useChainId, useConfig } from 'wagmi'
import { getPublicClient, waitForTransactionReceipt } from 'wagmi/actions'
import { erc721Abi, swapAbi } from './abis'
import { fetchOffer, fetchOffers, loadHoldings, readOffersFresh, type Holding, type OfferRecord } from './chain'
import { readWheel } from './wheel'
import { deploymentFor, vaultFor } from './deployments'
import { readLocked, readSqueekchainRates, readVaultPosition, readVaultStats } from './vault'
import { assetKey, type Asset, type Offer } from './offers'
import { REFRESH, refreshKeys, runTx, type RefreshScope, type TxState } from './tx'
import type { readNft } from './nfts'
import { asChainId } from './wagmi'

const key = (assets: Asset[]) => assets.map(assetKey).join(',')

function useClient(chainId: number): PublicClient | undefined {
  const config = useConfig()
  const id = asChainId(chainId)
  return id ? getPublicClient(config, { chainId: id }) as PublicClient : undefined
}

export function useActiveSwap() {
  const chainId = useChainId()
  return { chainId, deployment: deploymentFor(chainId) }
}

type HoldingRow = Omit<Holding, 'id'> & { id: bigint }

// Squeekchain's API bot-challenges cloud servers but allows browsers from any origin, so holdings are read
// straight from the visitor's browser, with the same canonical-graph check the server used.
async function fetchHoldings(owner: Address, firstPage: boolean) {
  const { holdings, complete } = await loadHoldings(owner, firstPage ? 1 : undefined)
  return { complete, holdings: holdings as HoldingRow[] }
}

/**
 * Progressive: the first 100 tokens arrive in one quick request and render at once; for bigger wallets the
 * full list loads in the background. `complete` is false until every token is known.
 */
export function useHoldings(chainId: number, owner?: Address) {
  const dep = deploymentFor(chainId)
  const first = useQuery({
    queryKey: ['squeek-holdings', chainId, owner ?? '', 'first'],
    enabled: !!owner && !!dep,
    queryFn: () => fetchHoldings(owner!, true),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
  const rest = useQuery({
    queryKey: ['squeek-holdings', chainId, owner ?? '', 'all'],
    enabled: !!owner && !!dep && first.data?.complete === false,
    queryFn: () => fetchHoldings(owner!, false),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
  const source = rest.data ?? first.data
  return {
    data: source?.holdings,
    complete: !!source?.complete,
    isLoading: first.isLoading,
    error: first.error ?? rest.error,
  }
}

export function useOffers(chainId: number, enabled = true) {
  const dep = deploymentFor(chainId)
  return useQuery({ queryKey: ['offers', chainId], enabled: enabled && !!dep, queryFn: () => fetchOffers(chainId), refetchInterval: 30_000 })
}

export function useNftInfo(chainId: number, asset: Asset, enabled = true) {
  const dep = deploymentFor(chainId)
  return useQuery({
    queryKey: ['nft', chainId, assetKey(asset)],
    enabled: enabled && !!dep,
    queryFn: async () => {
      const response = await fetch(`/api/nfts/${asset.collection}/${asset.tokenId}?chainId=${chainId}`)
      if (!response.ok) throw new Error('Could not load NFT.')
      const data = await response.json() as Omit<Awaited<ReturnType<typeof readNft>>, 'tokenId'> & { tokenId: string }
      return { ...data, tokenId: BigInt(data.tokenId) }
    },
    staleTime: 20_000,
    refetchOnWindowFocus: false,
  })
}

type GenesisRow = Omit<Awaited<ReturnType<typeof readNft>>, 'tokenId'> & { tokenId: bigint }
type WireGenesisRow = Omit<GenesisRow, 'tokenId'> & { tokenId: string }

// Every Genesis token is cached on its own key, so selecting a card or opening a page never refetches
// tokens that are already loaded. Tokens requested in the same tick share one /api/genesis request.
const genesisQueue = new Map<number, Map<string, { resolve: (row: GenesisRow) => void; reject: (error: Error) => void }[]>>()
let genesisFlush: ReturnType<typeof setTimeout> | null = null

function flushGenesis() {
  genesisFlush = null
  for (const [chainId, waiting] of genesisQueue) {
    genesisQueue.delete(chainId)
    const ids = [...waiting.keys()]
    for (let index = 0; index < ids.length; index += 50) {
      const chunk = ids.slice(index, index + 50)
      fetch(`/api/genesis?chainId=${chainId}&ids=${chunk.join(',')}`)
        .then(async (response) => {
          if (!response.ok) throw new Error('Could not load the official Genesis collection.')
          const rows = await response.json() as WireGenesisRow[]
          const byId = new Map(rows.map((row) => [row.tokenId, { ...row, tokenId: BigInt(row.tokenId) }]))
          for (const id of chunk) {
            const row = byId.get(id)
            for (const w of waiting.get(id)!) row ? w.resolve(row) : w.reject(new Error(`Genesis #${id} was not returned.`))
          }
        })
        .catch((error: Error) => { for (const id of chunk) for (const w of waiting.get(id)!) w.reject(error) })
    }
  }
}

function loadGenesis(chainId: number, id: string): Promise<GenesisRow> {
  return new Promise((resolve, reject) => {
    const waiting = genesisQueue.get(chainId) ?? new Map()
    genesisQueue.set(chainId, waiting)
    waiting.set(id, [...(waiting.get(id) ?? []), { resolve, reject }])
    genesisFlush ??= setTimeout(flushGenesis, 0)
  })
}

export function useGenesisInfos(chainId: number, ids: bigint[]) {
  const dep = deploymentFor(chainId)
  const unique = [...new Set(ids.map((id) => id.toString()))]
  return useQueries({
    queries: unique.map((id) => ({
      queryKey: ['genesis-nft', chainId, id],
      enabled: !!dep,
      queryFn: () => loadGenesis(chainId, id),
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    })),
    combine: (results) => ({
      // Rows arrive as they load, so cards fill in progressively instead of waiting for the slowest batch.
      data: results.flatMap((result) => (result.data ? [result.data] : [])),
      isLoading: results.some((result) => result.isLoading),
      error: results.find((result) => result.error)?.error ?? null,
    }),
  })
}

/** Genesis token IDs most recently claimed from Squeekchain's test dispenser, newest first. */
export function useRecentClaims(chainId: number) {
  const dep = deploymentFor(chainId)
  return useQuery({
    queryKey: ['genesis-claims', chainId],
    enabled: !!dep,
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/genesis/claimed?chainId=${chainId}`, { signal })
      if (!response.ok) throw new Error('Could not load recently claimed Squeeks.')
      const body = await response.json() as { ids: string[] }
      return body.ids.map((id) => BigInt(id))
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
  })
}

export function useOffer(chainId: number, id: bigint | null) {
  const dep = deploymentFor(chainId)
  return useQuery({
    queryKey: ['offer', chainId, id?.toString() ?? ''],
    enabled: !!dep && id !== null,
    queryFn: () => fetchOffer(chainId, id!),
    refetchInterval: (query) => (query.state.data === null && query.state.dataUpdateCount < 8 ? 4000 : false),
  })
}

export function useChecks(chainId: number, records: OfferRecord[], taker: Address | undefined) {
  const dep = deploymentFor(chainId)
  const client = useClient(chainId)
  return useQuery({
    queryKey: ['checks', chainId, taker ?? '', records.map((r) => r.id.toString()).join(',')],
    enabled: !!dep && !!client && !!taker && records.length > 0,
    queryFn: async () => {
      const reasons = await Promise.all(records.map((r) => client!.readContract({ address: dep!.swap, abi: swapAbi, functionName: 'check', args: [r.id, r.offer, taker!] })))
      return Object.fromEntries(records.map((r, i) => [r.id.toString(), reasons[i]])) as Record<string, number>
    },
    refetchInterval: 30_000,
  })
}

export function useSwapAccount(chainId: number, owner: Address | undefined) {
  const dep = deploymentFor(chainId)
  const client = useClient(chainId)
  return useQuery({
    queryKey: ['swap-account', chainId, owner ?? ''],
    enabled: !!dep && !!client && !!owner,
    queryFn: async () => ({ nonce: await client!.readContract({ address: dep!.swap, abi: swapAbi, functionName: 'nonceOf', args: [owner!] }) }),
  })
}

export function useApprovals(chainId: number, owner: Address | undefined, assets: Asset[]) {
  const dep = deploymentFor(chainId)
  const client = useClient(chainId)
  return useQuery({
    queryKey: ['approvals', chainId, owner ?? '', key(assets)],
    enabled: !!dep && !!client && !!owner && assets.length > 0,
    queryFn: async () => {
      const approved = await Promise.all(assets.map((asset) => client!.readContract({ address: asset.collection, abi: erc721Abi, functionName: 'getApproved', args: [asset.tokenId] }).catch(() => null)))
      return Object.fromEntries(assets.map((asset, i) => [assetKey(asset), approved[i]?.toLowerCase() === dep!.swap.toLowerCase()])) as Record<string, boolean>
    },
  })
}

export function useCheck(chainId: number, id: bigint, offer: Offer | undefined, taker: Address | undefined) {
  const dep = deploymentFor(chainId)
  const client = useClient(chainId)
  return useQuery({
    queryKey: ['check', chainId, id.toString(), taker ?? ''],
    enabled: !!dep && !!client && !!offer && !!taker,
    queryFn: () => client!.readContract({ address: dep!.swap, abi: swapAbi, functionName: 'check', args: [id, offer!, taker!] }),
    refetchInterval: 15_000,
  })
}

export type { TxState }

export function useTx() {
  const config = useConfig()
  const queryClient = useQueryClient()
  const [state, setState] = useState<TxState>({ phase: 'idle', message: '' })
  function run(label: string, send: () => Promise<Hex>, scope: RefreshScope = 'offer', onConfirmed?: (receipt: TransactionReceipt) => void): Promise<TransactionReceipt | null> {
    return runTx(label, {
      send,
      wait: (hash) => waitForTransactionReceipt(config, { hash }),
      onConfirmed,
      refresh: () => {
        // The offer index behind /api/offers is cached for several seconds; this browser's next offer reads skip it.
        readOffersFresh()
        return refreshKeys(REFRESH[scope], (key) => queryClient.invalidateQueries({ queryKey: [key] }))
      },
      setState,
    })
  }
  return { state, run, busy: state.phase === 'signing' || state.phase === 'pending' }
}

export type SeedsRules = { base: number; perExtraNft: number; zoomies: number; dailyCap: number; nftCooldownSeconds: number }
export type SeedsEntry = { rank: number; wallet: Address; seeds: number; swaps: number; zoomies: number }
export type SeedsHistory = { id: string; time: number; zoomies: 'yes' | 'no' | 'pending'; nfts: number; seeds: number; reason: 'scored' | 'daily-cap' | 'pair-today' | 'cooldown' }
export type SeedsResponse = {
  rules: SeedsRules
  totalScoredSwaps: number
  leaderboard: SeedsEntry[]
  wallet: { address: Address; rank: number | null; seeds: number; swaps: number; zoomies: number; scoredToday: number; history: SeedsHistory[] } | null
}

/** Seeds leaderboard plus this wallet's detail. Recomputed server-side from chain data. */
export function useSeeds(chainId: number, wallet?: Address) {
  const dep = deploymentFor(chainId)
  return useQuery({
    queryKey: ['seeds', chainId, wallet ?? ''],
    enabled: !!dep,
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/seeds?chainId=${chainId}${wallet ? `&wallet=${wallet}` : ''}`, { signal })
      if (!response.ok) throw new Error('Could not load Seeds right now.')
      return response.json() as Promise<SeedsResponse>
    },
    staleTime: 20_000,
    refetchInterval: 60_000,
  })
}

export type WheelStatus = { running: boolean; status: string; rpm: number; fresh: boolean; round: string }

/** Live hint: is Squeektoshi on the wheel right now? Read from the browser (see fetchHoldings). */
export function useWheel() {
  return useQuery({ queryKey: ['wheel'], queryFn: readWheel, refetchInterval: 15_000, staleTime: 10_000 })
}

/** Vault totals, power and the current earning rate. */
export function useVaultStats(chainId: number) {
  const vault = vaultFor(chainId)
  const client = useClient(chainId)
  return useQuery({ queryKey: ['vault-stats', chainId], enabled: !!vault && !!client, queryFn: () => readVaultStats(client!, vault!), refetchInterval: 30_000 })
}

/** A wallet's coins and what it can claim now (refreshed every 15 s so the number visibly grows). */
export function useVaultPosition(chainId: number, account?: Address) {
  const vault = vaultFor(chainId)
  const client = useClient(chainId)
  return useQuery({ queryKey: ['vault-position', chainId, account ?? ''], enabled: !!vault && !!client && !!account, queryFn: () => readVaultPosition(client!, vault!, account!), refetchInterval: 15_000 })
}

/** Every Squeek in the vault, read onchain. */
export function useVaultLocked(chainId: number) {
  const vault = vaultFor(chainId)
  const client = useClient(chainId)
  return useQuery({ queryKey: ['vault-locked', chainId], enabled: !!vault && !!client, queryFn: () => readLocked(client!, vault!), refetchInterval: 60_000 })
}

/** Whether the wallet approved the vault for its Squeeks (needed only to lock several at once). */
export function useVaultApproval(chainId: number, owner?: Address) {
  const vault = vaultFor(chainId)
  const client = useClient(chainId)
  return useQuery({
    queryKey: ['vault-approval', chainId, owner ?? ''],
    enabled: !!vault && !!client && !!owner,
    queryFn: () => client!.readContract({ address: vault!.squeeks, abi: erc721Abi, functionName: 'isApprovedForAll', args: [owner!, vault!.vault] }),
  })
}

/** SQK per block and how fast Squeektoshi has been completing blocks, from Squeekchain's API. */
export function useSqueekchainRates() {
  return useQuery({ queryKey: ['squeekchain-rates'], queryFn: readSqueekchainRates, staleTime: 10 * 60_000, refetchOnWindowFocus: false })
}
