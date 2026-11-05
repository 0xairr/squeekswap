import { isAddress, type Address } from 'viem'
import data from './deployments.json'

export const SQUEEK_CHAIN_ID = 11155111
export const CANONICAL_SQUEEK = '0xc4c7982657f00509548f3a3a41db7fa439a6856b' as Address
export const CANONICAL_CORE = '0xfd6c166d4b8e2962e65746a13e5a0797cd4de0c4' as Address
export const CANONICAL_MINING = '0x2dccb11fcc2defdd188555e45acb52231e82e218' as Address
export const CANONICAL_STAKING = '0x50fd1780526c3186a0c037c7622203bc4fb611ca' as Address
export const CANONICAL_SQK = '0xd78a3956cf63164d1fa1c622ad3c66623162fa1e' as Address
/** Squeekchain's Sepolia test dispenser: holds every Genesis NFT nobody has claimed yet. */
export const CANONICAL_DISPENSER = '0xe78b4420ce205b8864f2f326f3181f9dd5ea8b5f' as Address

export const localEnabled = process.env.NEXT_PUBLIC_ENABLE_LOCAL === '1'

export type Deployment = { version: 2; swap: Address; squeeks: Address; staking: Address; fromBlock: bigint; testCollection: boolean }
type Raw = { version?: number; swap: string | null; squeeks: string; staking: string; fromBlock: number; testCollection: boolean } | null

export function deploymentFor(chainId?: number, local = localEnabled): Deployment | null {
  if (chainId === undefined || (chainId === 31337 && !local)) return null
  const raw = (data as Record<string, Raw>)[String(chainId)]
  if (!raw || raw.version !== 2) return null
  const envSwap = chainId === SQUEEK_CHAIN_ID ? process.env.NEXT_PUBLIC_SWAP_ADDRESS : undefined
  const swap = envSwap || raw.swap
  if (!swap || !isAddress(swap)) return null
  return {
    version: 2,
    swap,
    squeeks: raw.squeeks as Address,
    staking: raw.staking as Address,
    fromBlock: BigInt(process.env.NEXT_PUBLIC_SWAP_FROM_BLOCK || raw.fromBlock),
    testCollection: raw.testCollection,
  }
}
