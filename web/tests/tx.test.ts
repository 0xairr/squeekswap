import { describe, expect, it } from 'vitest'
import type { Hex, TransactionReceipt } from 'viem'
import { REFRESH, refreshKeys, runTx, type TxState } from '@/lib/tx'

const hash = '0xabc' as Hex
const receipt = (status: 'success' | 'reverted') => ({ status, logs: [] }) as unknown as TransactionReceipt
// Buttons are enabled whenever the state is not busy.
const busy = (state: TxState) => state.phase === 'signing' || state.phase === 'pending'

/** A refresh that starts when called and finishes only when the test says so. */
function heldRefresh() {
  let finish!: () => void
  let markStarted!: () => void
  const started = new Promise<void>((resolve) => { markStarted = resolve })
  const refresh = () => { markStarted(); return new Promise<void>((resolve) => { finish = resolve }) }
  return { started, refresh, finish: () => finish() }
}

describe('runTx', () => {
  it('stays busy until the reads the transaction changed are back', async () => {
    const states: TxState[] = []
    const held = heldRefresh()
    const run = runTx('Approve #27', { send: async () => hash, wait: async () => receipt('success'), refresh: held.refresh, setState: (s) => states.push(s) })
    await held.started
    // Re-enabling now would show the pre-transaction data: the Approve button for an NFT that is already approved.
    expect(states.every(busy)).toBe(true)
    held.finish()
    await expect(run).resolves.toBeTruthy()
    expect(states.at(-1)).toMatchObject({ phase: 'done', hash })
  })

  it('hands the receipt over before refreshing, so a page can lock itself for what comes next', async () => {
    const order: string[] = []
    await runTx('Create offer', {
      send: async () => hash,
      wait: async () => receipt('success'),
      onConfirmed: () => { order.push('confirmed') },
      refresh: async () => { order.push('refresh') },
      setState: () => {},
    })
    expect(order).toEqual(['confirmed', 'refresh'])
  })

  it('reports a reverted transaction and refreshes nothing', async () => {
    const states: TxState[] = []
    let refreshed = false
    const result = await runTx('Accept swap', { send: async () => hash, wait: async () => receipt('reverted'), refresh: async () => { refreshed = true }, setState: (s) => states.push(s) })
    expect(result).toBeNull()
    expect(refreshed).toBe(false)
    expect(states.at(-1)).toMatchObject({ phase: 'error', message: 'Accept swap failed on-chain.' })
  })
})

describe('refresh order', () => {
  it('reads the offer status before anything that depends on it', async () => {
    const events: string[] = []
    await refreshKeys(REFRESH.swap, async (key) => { events.push(`start ${key}`); await new Promise((r) => setTimeout(r, 1)); events.push(`end ${key}`) })
    // After a swap the taker's approvals are cleared. Read first, they would show "Approve" on a still-open offer.
    expect(events.indexOf('start approvals')).toBeGreaterThan(events.indexOf('end offer'))
    expect(events.indexOf('start check')).toBeGreaterThan(events.indexOf('end offer'))
  })

  it('puts the offer status first for every transaction that changes an offer', () => {
    for (const scope of ['offer', 'swap'] as const) expect(REFRESH[scope][0]).toEqual(expect.arrayContaining(['offer', 'offers']))
  })
})
