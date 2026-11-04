import { BaseError, ContractFunctionRevertedError, ExecutionRevertedError } from 'viem'

/** True when the node reported that the contract itself reverted, as opposed to the RPC failing. */
function isContractRevert(error: unknown): boolean {
  if (!(error instanceof BaseError)) return false
  // A node that says "execution reverted" (with or without revert data).
  if (error.walk((e) => e instanceof ExecutionRevertedError)) return true
  // viem also files generic -32603 internal RPC errors under ContractFunctionRevertedError, so that class
  // only counts when it carries real revert data or a revert reason.
  const revert = error.walk((e) => e instanceof ContractFunctionRevertedError)
  return revert instanceof ContractFunctionRevertedError && ((!!revert.raw && revert.raw !== '0x') || /revert/i.test(revert.reason ?? ''))
}

/**
 * Resolves to null when the contract itself reverted (for example ownerOf on a token that does not exist),
 * and rethrows RPC and transport failures. An unreachable node must never be shown as "token not found".
 */
export async function revertedAsNull<T>(read: Promise<T>): Promise<T | null> {
  try {
    return await read
  } catch (error) {
    if (isContractRevert(error)) return null
    throw error
  }
}

/** Bump when the artwork format changes, so browsers holding the old (heavy SVG) responses fetch again. */
export const ART_VERSION = 'w2'

/**
 * Same-origin artwork path (a small WebP thumbnail). The level is part of the URL so cached art refreshes
 * after a merge levels up.
 */
export function genesisImagePath(tokenId: bigint | string, level: number | null): string {
  return `/api/squeeks/${tokenId}/image?v=${ART_VERSION}${level === null ? '' : `&l=${level}`}`
}
