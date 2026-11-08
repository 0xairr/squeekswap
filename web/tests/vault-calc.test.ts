import { describe, expect, it } from 'vitest'
import { estimate, houseAfter, sqkPower } from '../lib/vault-calc'

const network = { otherPower: 9_000_000, sqkPerBlock: 3_674, blocksPerDay: 1_078 }

describe('vault calculator', () => {
  it('uses Squeekchain’s SQK power formula', () => {
    expect(sqkPower(40, 0)).toBe(1)
    expect(sqkPower(1_000, 20_000)).toBe(525)
  })

  it('alone and a lone vault Squeek start at the same rate, then the vault keeps 25%', () => {
    const r = estimate({ myPower: 1000, vaultPower: 0, houseSqk: 0, days: 1, ...network })
    // Same power on the same network: day one in the vault is ~75% of alone, a little more from compounding.
    expect(r.vault[1] / r.alone[1]).toBeGreaterThan(0.75)
    expect(r.vault[1] / r.alone[1]).toBeLessThan(0.8)
  })

  it('a big vault with a house stake beats staking alone from the start', () => {
    const house = houseAfter(50_000, 0, network.otherPower, network.sqkPerBlock, network.blocksPerDay, 3)
    expect(house).toBeGreaterThan(0)
    const r = estimate({ myPower: 1000, vaultPower: 50_000, houseSqk: house, days: 7, ...network })
    expect(r.aheadOnDay).toBe(1)
    expect(r.vault[7]).toBeGreaterThan(r.alone[7])
  })

  it('reports when the vault pulls ahead and never on a zero-day estimate', () => {
    const none = estimate({ myPower: 1000, vaultPower: 0, houseSqk: 0, days: 0, ...network })
    expect(none.aheadOnDay).toBeNull()
    expect(none.alone).toEqual([0])
    const later = estimate({ myPower: 1000, vaultPower: 20_000, houseSqk: 0, days: 30, ...network })
    expect(later.aheadOnDay).not.toBeNull()
    expect(later.vault[30]).toBeGreaterThan(later.alone[30])
  })
})
