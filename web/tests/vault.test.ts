import { describe, expect, it } from 'vitest'
import { amount, COIN, coinsForLevel, sqkMultiplier, sqkPerBlockFrom, streamRates, unlockCost } from '../lib/vault'

const alice = '0x00000000000000000000000000000000000a11ce'
const bob = '0x0000000000000000000000000000000000000b0b'

describe('vault math', () => {
  it('pays holders 75% of the vault share of the stream, per 1,000 earning coins', () => {
    // 1 SQK/s across 100,000 power; the vault has 2,000 power and 2,000 earning coins.
    const rates = streamRates({
      streamRate: COIN, streamEndsAt: 2000n, now: 1000n,
      totalNftPower: 100_000n * COIN, totalSqkPower: 0n,
      vaultNftPower: 2000n * COIN, vaultSqkPower: 0n, earning: 2000n * COIN,
    })
    expect(rates.vaultPerHour).toBe(3_600n * COIN * 2n / 100n)
    // 72 SQK an hour to the vault, 54 to holders, 27 per 1,000 coins; the stream has 1,000 s left.
    expect(rates.perThousandPerHour).toBe(27n * COIN)
    expect(rates.streamSecondsLeft).toBe(1000)
  })

  it('reports an idle wheel instead of a fake rate', () => {
    const idle = streamRates({ streamRate: COIN, streamEndsAt: 1000n, now: 1000n, totalNftPower: COIN, totalSqkPower: 0n, vaultNftPower: COIN, vaultSqkPower: 0n, earning: COIN })
    expect(idle).toEqual({ vaultPerHour: null, perThousandPerHour: null, streamSecondsLeft: 0 })
  })

  it('charges the unlock fee only on Squeeks someone else locked', () => {
    expect(unlockCost(1000n, alice, alice, 200)).toEqual({ coins: 1000n * COIN, fee: 0n })
    expect(unlockCost(1000n, alice, bob, 200)).toEqual({ coins: 1000n * COIN, fee: 20n * COIN })
    expect(unlockCost(2200n, alice, bob, 0)).toEqual({ coins: 2200n * COIN, fee: 0n })
  })

  it('maps levels to coins and the vault power to its SQK multiplier', () => {
    expect(coinsForLevel(1)).toBe(1000)
    expect(coinsForLevel(2)).toBe(2200)
    expect(coinsForLevel(10)).toBe(1_207_269)
    expect(coinsForLevel(0)).toBeNull()
    expect(sqkMultiplier(20_000n * COIN)).toBe(21)
  })

  it('formats coin amounts plainly', () => {
    expect(amount(1000n * COIN)).toBe('1,000')
    expect(amount(12_500_000_000_000_000_000n)).toBe('12.5')
    expect(amount(1n, 2)).toBe('0')
  })
})

describe('issuance', () => {
  it('adds the launch bonus while it lasts and halves on schedule', () => {
    const schedule = { firstPeriodRateBaseUnits: (2_592n * COIN).toString(), launchBonusBaseUnits: (105_000_000n * COIN).toString(), bonusBlocks: '97020', halvingBlocks: '393470', closedThroughBlock: '2818' }
    expect(sqkPerBlockFrom(schedule)).toBeCloseTo(2_592 + 105_000_000 / 97_020, 3)
    expect(sqkPerBlockFrom({ ...schedule, closedThroughBlock: '400000' })).toBe(1_296)
  })
})
