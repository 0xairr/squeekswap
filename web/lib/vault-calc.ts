/**
 * Earnings estimate: one Squeek owner staking alone vs. putting the same Squeeks in the Cheeks vault.
 *
 * Squeekchain pays each completed block's SQK pro rata to staking power W. A Squeek's power P is its base
 * power; staked SQK S adds Q = S / 40 × (1 + P / 1,000) (P = the account's Squeek power). The vault is one
 * account: its Squeeks' power plus its house stake, which grows by 25% of everything the vault earns. Holders
 * share the other 75% by coins, which equal power, so your share is your power / the vault's Squeek power.
 * Staking alone means claiming, not compounding. Everything else on the network is held constant.
 */

export type CalcInput = {
  /** Squeek power you put in (1,000 per level-1). */
  myPower: number
  /** Squeek power already in the vault when you join. */
  vaultPower: number
  /** SQK the vault has already staked as its house stake. */
  houseSqk: number
  /** Staking power on the rest of Squeekchain (everything outside the vault and you). */
  otherPower: number
  sqkPerBlock: number
  blocksPerDay: number
  days: number
}

export type CalcResult = {
  /** Cumulative SQK at the end of each day, index 0 = day 0. */
  alone: number[]
  vault: number[]
  /** First whole day the vault total is ahead, or null if it never is within the period. */
  aheadOnDay: number | null
  houseAtEnd: number
}

const HOUSE = 0.25
const C = 40
const P_REF = 1000

export function sqkPower(stakedSqk: number, nftPower: number): number {
  return stakedSqk / C * (1 + nftPower / P_REF)
}

/** Grows a vault with no newcomers for `days`, returning its house stake: the "it already ran" what-if. */
export function houseAfter(vaultPower: number, houseSqk: number, otherPower: number, sqkPerBlock: number, blocksPerDay: number, days: number): number {
  let house = houseSqk
  const blocks = Math.round(days * blocksPerDay)
  for (let b = 0; b < blocks; b++) {
    const w = vaultPower + sqkPower(house, vaultPower)
    house += sqkPerBlock * w / (otherPower + w) * HOUSE
  }
  return house
}

export function estimate(input: CalcInput): CalcResult {
  const { myPower, otherPower, sqkPerBlock, blocksPerDay, days } = input
  const vaultPower = input.vaultPower + myPower
  let house = input.houseSqk
  let alone = 0
  let mine = 0
  const aloneDays = [0]
  const vaultDays = [0]
  let aheadOnDay: number | null = null
  const perDay = Math.max(0, Math.round(blocksPerDay))
  for (let day = 1; day <= days; day++) {
    for (let b = 0; b < perDay; b++) {
      alone += sqkPerBlock * myPower / (otherPower + myPower)
      const w = vaultPower + sqkPower(house, vaultPower)
      const earned = sqkPerBlock * w / (otherPower + w)
      house += earned * HOUSE
      mine += earned * (1 - HOUSE) * (myPower / vaultPower)
    }
    aloneDays.push(alone)
    vaultDays.push(mine)
    if (aheadOnDay === null && mine > alone) aheadOnDay = day
  }
  return { alone: aloneDays, vault: vaultDays, aheadOnDay, houseAtEnd: house }
}
