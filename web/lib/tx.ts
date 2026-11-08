import type { Hex, TransactionReceipt } from 'viem'
import { friendlyError } from './errors'

export type TxState = { phase: 'idle' | 'signing' | 'pending' | 'done' | 'error'; message: string; hash?: Hex }

/**
 * Which cached reads a confirmed transaction can change, refreshed one stage after another. Refreshing only
 * these keeps the page responsive: an approval does not need every Genesis card, holding and offer list to
 * reload. The offer status comes first because it decides which buttons a page shows: after a swap the taker's
 * approvals are cleared, and read before the status they would put "Approve" back on an offer that looks open.
 */
export const REFRESH = {
  approval: [['approvals', 'check', 'checks']],
  offer: [['offers', 'offer'], ['check', 'checks', 'swap-account']],
  swap: [['offers', 'offer'], ['check', 'checks', 'swap-account', 'approvals', 'squeek-holdings', 'genesis-nft', 'nft', 'seeds']],
  vault: [['vault-stats', 'vault-position', 'vault-locked', 'vault-approval'], ['squeek-holdings', 'genesis-nft']],
} as const satisfies Record<string, readonly (readonly string[])[]>
export type RefreshScope = keyof typeof REFRESH

export async function refreshKeys(stages: readonly (readonly string[])[], invalidate: (key: string) => Promise<unknown>) {
  for (const stage of stages) await Promise.all(stage.map(invalidate))
}

type TxSteps = {
  send: () => Promise<Hex>
  wait: (hash: Hex) => Promise<TransactionReceipt>
  /** Runs once the receipt is in, before the refresh, so a page can lock itself for what comes next. */
  onConfirmed?: (receipt: TransactionReceipt) => void
  refresh: () => Promise<unknown>
  setState: (state: TxState) => void
}

/**
 * Signs, waits for the receipt, then refreshes the reads it changed. The state stays `pending` until the
 * refresh is back: `done` re-enables the page's buttons, and on pre-transaction data that brings back the step
 * just finished (an Approve button after its approval confirmed).
 */
export async function runTx(label: string, { send, wait, onConfirmed, refresh, setState }: TxSteps): Promise<TransactionReceipt | null> {
  try {
    setState({ phase: 'signing', message: `Confirm “${label}” in your wallet.` })
    const hash = await send()
    setState({ phase: 'pending', message: `${label}: waiting for confirmation.`, hash })
    const receipt = await wait(hash)
    if (receipt.status !== 'success') throw new Error(`${label} failed on-chain.`)
    setState({ phase: 'pending', message: `${label}: confirmed. Updating the page…`, hash })
    onConfirmed?.(receipt)
    await refresh()
    setState({ phase: 'done', message: `${label}: confirmed.`, hash })
    return receipt
  } catch (error) {
    setState({ phase: 'error', message: friendlyError(error) })
    return null
  }
}
