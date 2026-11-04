import type { Address } from 'viem'
import { CANONICAL_CORE, CANONICAL_MINING, CANONICAL_SQUEEK, CANONICAL_SQK, CANONICAL_STAKING } from './deployments'
import { same } from './format'
import { fetchUpstream } from './upstream'

const API = 'https://api.squeekchain.com/v1'
type Component = { address?: string } | null
type Economy = { status: 'available' | 'unavailable'; reason?: string; deployment?: { components?: { collection?: Component; core?: Component; token?: Component; mining?: Component; staking?: Component } } }
type AccountToken = { tokenId: string; custody: 'wallet' | 'staking'; level: number; basePower: string; nextMergeHeight: string; mergeState: string }
type AccountPage = { status: 'available' | 'unavailable'; reason?: string; tokens?: AccountToken[]; nextCursor?: string | null }

export type Holding = { id: bigint; level: number; custody: 'wallet' | 'staking'; image: string | null }
const MAX_PAGES = 100
let graphCheck: Promise<void> | null = null

async function json<T>(url: string): Promise<T> {
  const response = await fetchUpstream(url, { headers: { accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(8_000) })
  if (!response.ok) throw new Error(`Squeekchain API returned HTTP ${response.status}.`)
  return response.json() as Promise<T>
}

export function assertCanonicalGraph(): Promise<void> {
  graphCheck ??= json<Economy>(`${API}/economy/state`).then((state) => {
    if (state.status !== 'available') throw new Error(`Squeekchain data is unavailable: ${state.reason ?? 'unknown reason'}.`)
    const c = state.deployment?.components
    if (!same(c?.collection?.address, CANONICAL_SQUEEK) || !same(c?.core?.address, CANONICAL_CORE) || !same(c?.token?.address, CANONICAL_SQK) || !same(c?.mining?.address, CANONICAL_MINING) || !same(c?.staking?.address, CANONICAL_STAKING)) {
      throw new Error('The live Squeekchain contract graph does not match this build. Swapping is disabled.')
    }
  }).catch((error) => { graphCheck = null; throw error })
  return graphCheck
}

/**
 * A wallet's Genesis holdings from the Squeekchain account API (100 tokens per page, pages are sequential).
 * `maxPages` stops early so a big wallet can show its first page at once; `complete` says whether more exist.
 */
export async function loadHoldings(owner: Address, maxPages = MAX_PAGES): Promise<{ holdings: Holding[]; complete: boolean }> {
  await assertCanonicalGraph()
  const holdings: Holding[] = []
  const seen = new Set<string>()
  let cursor: string | null = null
  // 100 pages x 100 tokens covers the whole 9,999-token collection; a repeating cursor would otherwise loop forever.
  for (let pages = 0; pages < Math.min(maxPages, MAX_PAGES); pages++) {
    const query: URLSearchParams = new URLSearchParams({ limit: '100', ...(cursor ? { cursor } : {}) })
    const page: AccountPage = await json<AccountPage>(`${API}/accounts/${owner}?${query}`)
    if (page.status !== 'available') throw new Error(`Squeekchain account data is unavailable: ${page.reason ?? 'unknown reason'}.`)
    for (const token of page.tokens ?? []) holdings.push({ id: BigInt(token.tokenId), level: token.level, custody: token.custody, image: null })
    cursor = page.nextCursor ?? null
    if (!cursor) return { holdings, complete: true }
    if (seen.has(cursor)) throw new Error('Squeekchain account data repeated a page.')
    seen.add(cursor)
  }
  if (maxPages < MAX_PAGES) return { holdings, complete: false }
  throw new Error('Squeekchain account data has too many pages.')
}
