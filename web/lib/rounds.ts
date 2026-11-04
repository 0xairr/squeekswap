import { parseAbi, type PublicClient } from 'viem'
import { CANONICAL_CORE } from './deployments'

// Squeektoshi's wheel, as recorded onchain by SqueekCore. RoundRecorded is emitted only for rounds where the
// hamster ran (work > 0); BatchSettled marks every round up to settledThroughRound as final.
export const coreAbi = parseAbi([
  'event RoundRecorded(uint64 indexed roundId, uint64 work, uint64 cumulativeWork, uint96 cumulativeBlockUnits, uint32 workPerThousandBlocks, bytes32 dataHash)',
  'event BatchSettled(bytes32 indexed digest, address indexed reporter, uint64 indexed settledThroughRound, uint256 nonce, uint64 previousSettledThroughRound, uint16 activeRoundCount, uint64 cumulativeWork, uint96 cumulativeBlockUnits)',
])

export type RoundsSnapshot = { active: Set<string>; settledThroughRound: bigint }

const MIN_INTERVAL_MS = 15_000
const REORG_WINDOW = 12n

/** Incremental reader for wheel rounds since `fromBlock` (SqueekSwap V2's deployment; earlier rounds never matter). */
export function createRoundIndexer(client: PublicClient, fromBlock: bigint, chunk: bigint) {
  const active = new Set<string>()
  let settledThroughRound = 0n
  let lastBlock = fromBlock - 1n
  let attemptedAt = 0
  let loaded = false
  let inFlight: Promise<void> | null = null

  async function refresh() {
    const latest = await client.getBlockNumber()
    const start = lastBlock + 1n - REORG_WINDOW > fromBlock ? lastBlock + 1n - REORG_WINDOW : fromBlock
    for (let from = start; from <= latest; from += chunk) {
      const to = from + chunk - 1n < latest ? from + chunk - 1n : latest
      const events = await client.getContractEvents({ address: CANONICAL_CORE, abi: coreAbi, fromBlock: from, toBlock: to, strict: true })
      for (const e of events) {
        if (e.eventName === 'RoundRecorded' && e.args.work > 0n) active.add(e.args.roundId.toString())
        if (e.eventName === 'BatchSettled' && e.args.settledThroughRound > settledThroughRound) settledThroughRound = e.args.settledThroughRound
      }
      lastBlock = to
    }
    loaded = true
  }

  return {
    async get(): Promise<RoundsSnapshot> {
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
      if (!loaded) throw new Error('Wheel rounds have not loaded yet.')
      return { active: new Set(active), settledThroughRound }
    },
  }
}
