import { parseAbi, type Address, type PublicClient } from 'viem'

const transferAbi = parseAbi(['event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)'])

const MIN_INTERVAL_MS = 15_000
const REORG_WINDOW = 12n
/** How many of the newest claims to keep. The browser shows the ones still held in a wallet. */
export const RECENT_CLAIMS = 48

/**
 * Incremental reader for Genesis NFTs leaving Squeekchain's test dispenser (one Transfer per claimed token).
 * `get()` returns token IDs newest claim first.
 */
export function createClaimIndexer(client: PublicClient, collection: Address, dispenser: Address, fromBlock: bigint, chunk: bigint) {
  // tokenId -> position of its claim (block, log index); a reorg re-read writes the same position again.
  const claims = new Map<string, { block: bigint; index: number }>()
  let lastBlock = fromBlock - 1n
  let attemptedAt = 0
  let loaded = false
  let inFlight: Promise<void> | null = null

  async function refresh() {
    const latest = await client.getBlockNumber()
    const start = lastBlock + 1n - REORG_WINDOW > fromBlock ? lastBlock + 1n - REORG_WINDOW : fromBlock
    for (let from = start; from <= latest; from += chunk) {
      const to = from + chunk - 1n < latest ? from + chunk - 1n : latest
      const events = await client.getContractEvents({ address: collection, abi: transferAbi, eventName: 'Transfer', args: { from: dispenser }, fromBlock: from, toBlock: to, strict: true })
      for (const e of events) claims.set(e.args.tokenId.toString(), { block: e.blockNumber, index: e.logIndex })
      lastBlock = to
    }
    loaded = true
  }

  return {
    async get(): Promise<bigint[]> {
      if (Date.now() - attemptedAt > MIN_INTERVAL_MS) {
        if (!inFlight) {
          attemptedAt = Date.now()
          inFlight = refresh().finally(() => (inFlight = null))
        }
        try {
          await inFlight
        } catch (error) {
          if (!loaded) throw error
        }
      } else if (inFlight) {
        await inFlight.catch(() => undefined)
      }
      if (!loaded) throw new Error('Genesis claims have not loaded yet.')
      return [...claims]
        .sort(([, a], [, b]) => (a.block === b.block ? b.index - a.index : a.block < b.block ? 1 : -1))
        .slice(0, RECENT_CLAIMS)
        .map(([id]) => BigInt(id))
    },
  }
}
