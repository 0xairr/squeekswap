import { formatUnits, type Address, type PublicClient } from 'viem'
import { stakingAbi, vaultAbi } from './abis'
import { same } from './format'
import type { VaultDeployment } from './deployments'

export const COIN = 10n ** 18n
const BPS = 10_000n
const HOUSE_BPS = 2_500n
const HOUR = 3_600n

/** Squeekchain's power per level (SqueekStaking.basePower): coins a Squeek of that level mints, in whole coins. */
export const LEVEL_POWER = [1000, 2200, 4840, 10648, 23426, 51536, 113380, 249436, 548759, 1207269] as const
export const coinsForLevel = (level: number | null | undefined): number | null => (level && level >= 1 && level <= 10 ? LEVEL_POWER[level - 1] : null)

export type VaultStats = {
  lockedCount: number
  supply: bigint
  earning: bigint
  houseStaked: bigint
  houseOwed: bigint
  nftPower: bigint
  sqkPower: bigint
  feeBps: number
  scheduledFeeBps: number
  scheduledAt: number
  intakePaused: boolean
  /** Coins sitting in the official Uniswap pool (they never earn). */
  pairCoins: bigint
  /** All staking power on Squeekchain, in whole power units. */
  networkPower: number
  /** The vault's own staking power (Squeeks + house stake), in whole power units. */
  vaultWeight: number
  /** SQK an hour that 1,000 earning coins receive at the current stream rate; null while nothing streams. */
  perThousandPerHour: bigint | null
  /** SQK an hour the vault itself earns right now (before the 75/25 split); null while nothing streams. */
  vaultPerHour: bigint | null
  /** Seconds until the current Squeek block's 20-minute stream runs out (0 when idle). */
  streamSecondsLeft: number
}

export type StreamInput = {
  streamRate: bigint
  streamEndsAt: bigint
  totalNftPower: bigint
  totalSqkPower: bigint
  vaultNftPower: bigint
  vaultSqkPower: bigint
  earning: bigint
  now: bigint
}

/**
 * The vault's hourly SQK at Squeekchain's current stream rate, and the holders' share per 1,000 coins. Each
 * completed Squeek block streams for 20 minutes, so this is a "right now" rate, not a daily forecast.
 */
export function streamRates(s: StreamInput): { vaultPerHour: bigint | null; perThousandPerHour: bigint | null; streamSecondsLeft: number } {
  const total = s.totalNftPower + s.totalSqkPower
  if (s.streamRate === 0n || s.now >= s.streamEndsAt || total === 0n) return { vaultPerHour: null, perThousandPerHour: null, streamSecondsLeft: 0 }
  const vaultPerHour = s.streamRate * HOUR * (s.vaultNftPower + s.vaultSqkPower) / total
  const toHolders = vaultPerHour - vaultPerHour * HOUSE_BPS / BPS
  const perThousandPerHour = s.earning === 0n ? null : toHolders * 1000n * COIN / s.earning
  return { vaultPerHour, perThousandPerHour, streamSecondsLeft: Number(s.streamEndsAt - s.now) }
}

/** Multiplier the vault's Squeek power gives its staked SQK: (1,000 + P) / 1,000, P in whole power. */
export function sqkMultiplier(nftPowerWad: bigint): number {
  return 1 + Number(nftPowerWad / COIN) / 1000
}

/** Coins needed to take one Squeek out: its power, plus the fee unless the viewer locked it. */
export function unlockCost(power: bigint, lockedBy: Address, viewer: Address | undefined, feeBps: number): { coins: bigint; fee: bigint } {
  const coins = power * COIN
  const fee = feeBps > 0 && !same(lockedBy, viewer) ? coins * BigInt(feeBps) / BPS : 0n
  return { coins, fee }
}

/** "1,000" or "12.5" from base units, at most `decimals` fraction digits. */
export function amount(value: bigint, decimals = 2): string {
  const [whole, fraction = ''] = formatUnits(value, 18).split('.')
  const trimmed = fraction.slice(0, decimals).replace(/0+$/, '')
  return `${BigInt(whole).toLocaleString('en-US')}${trimmed ? `.${trimmed}` : ''}`
}

export async function readVaultStats(client: PublicClient, dep: VaultDeployment): Promise<VaultStats> {
  const v = { address: dep.vault, abi: vaultAbi } as const
  const s = { address: dep.staking, abi: stakingAbi } as const
  const [supply, earning, lockedCount, houseStaked, houseOwed, feeBps, scheduled, pairCoins, power, reward, paused, block] = await Promise.all([
    client.readContract({ ...v, functionName: 'totalSupply' }),
    client.readContract({ ...v, functionName: 'earningSupply' }),
    client.readContract({ ...v, functionName: 'lockedCount' }),
    client.readContract({ ...v, functionName: 'houseStaked' }),
    client.readContract({ ...v, functionName: 'houseOwed' }),
    client.readContract({ ...v, functionName: 'unlockFeeBps' }),
    client.readContract({ ...v, functionName: 'scheduledUnlockFee' }),
    client.readContract({ ...v, functionName: 'balanceOf', args: [dep.pair] }),
    client.readContract({ ...s, functionName: 'accountPower', args: [dep.vault] }),
    client.readContract({ ...s, functionName: 'rewardState' }),
    client.readContract({ ...s, functionName: 'paused' }),
    client.getBlock(),
  ])
  const rates = streamRates({
    streamRate: reward.streamRate,
    streamEndsAt: reward.streamEndsAt,
    totalNftPower: reward.totalNftPower,
    totalSqkPower: reward.totalSqkPower,
    vaultNftPower: power[0],
    vaultSqkPower: power[1],
    earning,
    now: block.timestamp,
  })
  return {
    lockedCount: Number(lockedCount),
    supply,
    earning,
    houseStaked,
    houseOwed,
    nftPower: power[0],
    sqkPower: power[1],
    feeBps: Number(feeBps),
    scheduledFeeBps: Number(scheduled[0]),
    scheduledAt: Number(scheduled[1]),
    intakePaused: paused,
    pairCoins,
    networkPower: Number((reward.totalNftPower + reward.totalSqkPower) / COIN),
    vaultWeight: Number((power[0] + power[1]) / COIN),
    ...rates,
  }
}

export type VaultPosition = { coins: bigint; pendingSqk: bigint; pendingCoins: bigint }

export async function readVaultPosition(client: PublicClient, dep: VaultDeployment, account: Address): Promise<VaultPosition> {
  const v = { address: dep.vault, abi: vaultAbi } as const
  const [coins, pending] = await Promise.all([
    client.readContract({ ...v, functionName: 'balanceOf', args: [account] }),
    client.readContract({ ...v, functionName: 'pendingRewards', args: [account] }),
  ])
  return { coins, pendingSqk: pending[0], pendingCoins: pending[1] }
}

export type LockedSqueek = { id: bigint; lockedBy: Address; power: bigint }

/** Every Squeek in the vault with who locked it and its power, read onchain (no Squeekchain API). */
export async function readLocked(client: PublicClient, dep: VaultDeployment): Promise<LockedSqueek[]> {
  const v = { address: dep.vault, abi: vaultAbi } as const
  const count = await client.readContract({ ...v, functionName: 'lockedCount' })
  const ids: bigint[] = []
  for (let offset = 0n; offset < count; offset += 500n) {
    ids.push(...await client.readContract({ ...v, functionName: 'lockedIds', args: [offset, 500n] }))
  }
  const infos = ids.length === 0 ? [] : await client.multicall({
    allowFailure: false,
    contracts: ids.map((id) => ({ ...v, functionName: 'lockInfo' as const, args: [id] as const })),
  })
  return ids.map((id, i) => ({ id, lockedBy: infos[i][0], power: infos[i][1] }))
}

type Schedule = { firstPeriodRateBaseUnits: string; launchBonusBaseUnits: string; bonusBlocks: string; halvingBlocks: string; closedThroughBlock: string }

/** SQK paid per completed Squeek block right now (base rate plus the launch bonus while it lasts). */
export function sqkPerBlockFrom(schedule: Schedule): number {
  const done = Number(schedule.closedThroughBlock)
  const halvings = Math.floor(done / Number(schedule.halvingBlocks))
  const base = Number(BigInt(schedule.firstPeriodRateBaseUnits) / COIN) / 2 ** halvings
  const bonus = done < Number(schedule.bonusBlocks) ? Number(BigInt(schedule.launchBonusBaseUnits) / COIN) / Number(schedule.bonusBlocks) : 0
  return base + bonus
}

/** Read in the browser: Squeekchain's API allows any origin but blocks cloud servers. */
export async function readSqkPerBlock(): Promise<number> {
  const response = await fetch('https://api.squeekchain.com/v1/economy/state', { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8_000) })
  if (!response.ok) throw new Error(`Squeekchain API returned HTTP ${response.status}.`)
  const body = await response.json() as { schedule?: Schedule }
  if (!body.schedule) throw new Error('Squeekchain API returned no issuance schedule.')
  return sqkPerBlockFrom(body.schedule)
}
