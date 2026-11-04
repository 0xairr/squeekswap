import { describe, expect, it } from 'vitest'
import { CANONICAL_SQUEEK, deploymentFor } from '@/lib/deployments'

describe('deployments', () => {
  it('returns null for unknown or undeployed chains', () => {
    expect(deploymentFor(undefined)).toBeNull()
    expect(deploymentFor(424242)).toBeNull()
  })
  it('serves the local chain only when it is switched on', () => {
    expect(deploymentFor(31337, false)).toBeNull()
  })
  it('points Sepolia at V2 and the official Genesis collection', () => {
    const d = deploymentFor(11155111)
    expect(d).not.toBeNull()
    expect(d!.version).toBe(2)
    expect(d!.fromBlock).toBe(12056300n)
    expect(d!.swap.toLowerCase()).toBe('0x28eb722a6abbaf3a69be0fcc6e026b9d0ceffbf5')
    expect(d!.squeeks).toBe(CANONICAL_SQUEEK)
  })
})
