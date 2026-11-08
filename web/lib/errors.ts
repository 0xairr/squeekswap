import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from 'viem'
import { reasonText } from './offers'

export const CONTRACT_ERRORS: Record<string, string> = {
  BadConfig: 'The registry admin change was rejected.',
  NotRegistryAdmin: 'Only the registry admin can change supported collections.',
  NotPendingRegistryAdmin: 'Only the pending registry admin can accept the role.',
  BadCollection: 'That contract is not a standards-compliant ERC-721 collection.',
  NotMaker: 'Only the wallet that made this offer can do that.',
  SelfTrade: 'You cannot trade with yourself.',
  BadExpiry: 'The expiry must be in the future and at most 90 days out.',
  BadItems: 'This offer breaks a bundle rule: 1-8 NFTs per side, each NFT once.',
  BadNonce: 'Your offer nonce changed. Reload and try again.',
  UnsupportedCollection: 'A collection in this offer is not supported by SqueekSwap.',
  NotOwner: 'You no longer hold one of the Squeeks you are offering.',
  BadWantedOwner: 'The wanted Squeeks no longer sit in one wallet, or no longer belong to the named taker.',
  NotOpen: 'This offer is no longer open.',
  NotExpired: 'This offer has not expired yet.',
  ReentrantCall: 'The contract refused a nested call.',
  TransferInvariantFailed: 'A collection did not complete a transfer, so nothing moved.',
  ERC721NonexistentToken: 'That Squeek does not exist.',
  ERC721IncorrectOwner: 'That Squeek is held by another wallet.',
  ERC721InsufficientApproval: 'SqueekSwap is not approved for that Squeek.',
  ERC721InvalidApprover: 'Only the holder of that Squeek can approve it.',
  ERC721InvalidOperator: 'That approval target is invalid.',
  EnforcedPause: 'Squeek Genesis transfers are paused right now.',
  // SqueekSwap Vault
  BadBatch: 'Pick between 1 and 100 Squeeks.',
  NotGenesis: 'The vault only takes official Squeek Genesis NFTs.',
  NotLocked: 'That Squeek is not in the vault any more.',
  UnknownLevel: 'Squeekchain does not list a power for that Squeek’s level.',
  FeeTooHigh: 'The unlock fee can be at most 5%.',
  NoTransferToVault: 'Coins sent to the vault itself would be stuck, so the vault refuses them.',
  InsufficientGas: 'The transaction ran too low on gas to read Squeekchain. Try again with the wallet’s suggested gas.',
  ERC20InsufficientBalance: 'You don’t hold enough coins for that.',
  ERC20InsufficientAllowance: 'The coin allowance is too low.',
  OwnableUnauthorizedAccount: 'Only the vault owner can change the unlock fee.',
  EmergencyPaused: 'Squeekchain staking is paused right now, so nothing can be locked. Unlocking and claiming still work.',
  InvalidDeposit: 'Squeekchain staking refused this Squeek.',
}

export function friendlyError(error: unknown): string {
  if (error instanceof BaseError) {
    if (error.walk((e) => e instanceof UserRejectedRequestError)) return 'You rejected the request in your wallet.'
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError)
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName
      if (name === 'CannotFill') return reasonText(Number(revert.data?.args?.[0]))
      if (name) return CONTRACT_ERRORS[name] ?? `The contract refused: ${name}.`
    }
    return error.shortMessage
  }
  return error instanceof Error ? error.message : 'Something went wrong.'
}
