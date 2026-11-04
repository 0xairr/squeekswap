import { isAddress, type Address } from 'viem'
import data from './deployments.json'

export const SQUEEK_CHAIN_ID = 11155111
export const CANONICAL_SQUEEK = '0xcb98349c134ab983da5bfd80527dfe2552bdb70f' as Address
export const CANONICAL_CORE = '0x980b4424c007caf7a1f3670b48c8eaef7ebc3d44' as Address
export const CANONICAL_MINING = '0xcd46990f8349057335289ef282c276204b6cdc62' as Address
export const CANONICAL_STAKING = '0x4b67b739dfd832f4eac67a7aa3bc244fb74cea4f' as Address
export const CANONICAL_SQK = '0x5501e1fa81be1c3f49225fa7668da0245d07db60' as Address

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
