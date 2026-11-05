import { describe, expect, it, vi } from 'vitest'
import type { Address, PublicClient } from 'viem'
import { createClaimIndexer } from '@/lib/claims'
import { CANONICAL_DISPENSER, deploymentFor } from '@/lib/deployments'
import { genesisCustody } from '@/lib/nfts'
import { serverClient } from '@/lib/server'

const collection = '0xc4c7982657f00509548f3a3a41db7fa439a6856b' as Address
const holder = '0x3333333333333333333333333333333333333333' as Address

type Log = { blockNumber: bigint; logIndex: number; args: { tokenId: bigint } }

/** A fake chain: `logs` are dispenser Transfers; each getContractEvents call returns those inside its range. */
function fakeClient(head: { value: bigint }, logs: Log[], calls: { from: bigint; to: bigint }[] = []) {
  return {
    getBlockNumber: async () => head.value,
    getContractEvents: async ({ fromBlock, toBlock }: { fromBlock: bigint; toBlock: bigint }) => {
      calls.push({ from: fromBlock, to: toBlock })
      return logs.filter((log) => log.blockNumber >= fromBlock && log.blockNumber <= toBlock)
    },
  } as unknown as PublicClient
}

describe('Genesis custody', () => {
  const dep = deploymentFor(11155111)!
  it('marks Squeeks still in the test dispenser as unclaimed', () => {
    expect(genesisCustody(CANONICAL_DISPENSER, dep)).toBe('unclaimed')
    expect(genesisCustody(dep.staking, dep)).toBe('staking')
    expect(genesisCustody(holder, dep)).toBe('wallet')
    expect(genesisCustody(null, dep)).toBe('unknown')
  })
})

describe('createClaimIndexer', () => {
  it('returns claimed token IDs newest first, across chunks', async () => {
    const logs: Log[] = [
      { blockNumber: 105n, logIndex: 0, args: { tokenId: 1n } },
      { blockNumber: 105n, logIndex: 1, args: { tokenId: 2n } },
      { blockNumber: 230n, logIndex: 4, args: { tokenId: 19n } },
      { blockNumber: 230n, logIndex: 5, args: { tokenId: 20n } },
    ]
    const calls: { from: bigint; to: bigint }[] = []
    const claims = createClaimIndexer(fakeClient({ value: 250n }, logs, calls), collection, CANONICAL_DISPENSER, 100n, 100n)
    expect(await claims.get()).toEqual([20n, 19n, 2n, 1n])
    expect(calls).toEqual([{ from: 100n, to: 199n }, { from: 200n, to: 250n }])
  })

  it('re-reads the reorg window on the next refresh without duplicating a claim', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      const head = { value: 150n }
      const logs: Log[] = [{ blockNumber: 145n, logIndex: 0, args: { tokenId: 7n } }]
      const calls: { from: bigint; to: bigint }[] = []
      const claims = createClaimIndexer(fakeClient(head, logs, calls), collection, CANONICAL_DISPENSER, 100n, 100n)
      expect(await claims.get()).toEqual([7n])
      head.value = 160n
      logs.push({ blockNumber: 158n, logIndex: 0, args: { tokenId: 8n } })
      vi.setSystemTime(Date.now() + 20_000)
      expect(await claims.get()).toEqual([8n, 7n])
      // The second scan starts 12 blocks before the last one read (150), so block 145 is read twice.
      expect(calls[1]).toEqual({ from: 139n, to: 160n })
    } finally {
      vi.useRealTimers()
    }
  })

  it('fails while nothing has loaded, so the route answers 502 instead of an empty list', async () => {
    const client = { getBlockNumber: async () => { throw new Error('RPC down') } } as unknown as PublicClient
    await expect(createClaimIndexer(client, collection, CANONICAL_DISPENSER, 100n, 100n).get()).rejects.toThrow('RPC down')
  })
})

describe('serverClient', () => {
  it('falls back to a full-history RPC on Sepolia (publicnode prunes logs older than ~10k blocks)', () => {
    const client = serverClient(11155111)!
    expect(client.transport.type).toBe('fallback')
  })
})
