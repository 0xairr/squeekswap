import { afterEach, describe, expect, it, vi } from 'vitest'

// Shape of api.squeekchain.com/v1/economy/state for installation sepolia-core-sepolia-20261103.
const live = {
  status: 'available',
  deployment: {
    components: {
      collection: { address: '0xc4c7982657f00509548f3a3a41db7fa439a6856b' },
      core: { address: '0xfd6c166d4b8e2962e65746a13e5a0797cd4de0c4' },
      token: { address: '0xd78a3956cf63164d1fa1c622ad3c66623162fa1e' },
      mining: { address: '0x2dccb11fcc2defdd188555e45acb52231e82e218' },
      staking: { address: '0x50fd1780526c3186a0c037c7622203bc4fb611ca' },
    },
  },
}

async function check(state: unknown) {
  vi.resetModules()
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(state), { status: 200 })))
  const { assertCanonicalGraph } = await import('@/lib/squeekchain')
  return assertCanonicalGraph()
}

afterEach(() => vi.unstubAllGlobals())

describe('assertCanonicalGraph', () => {
  it('accepts the live Squeekchain contract graph', async () => {
    await expect(check(live)).resolves.toBeUndefined()
  })

  it('refuses a graph whose Genesis collection differs from this build', async () => {
    const other = structuredClone(live)
    other.deployment.components.collection.address = '0xcb98349c134ab983da5bfd80527dfe2552bdb70f'
    await expect(check(other)).rejects.toThrow('does not match')
  })

  it('refuses a response without contract addresses', async () => {
    await expect(check({ status: 'available' })).rejects.toThrow('does not match')
  })
})
