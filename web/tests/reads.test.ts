import { describe, expect, it } from 'vitest'
import { createPublicClient, custom, encodeErrorResult, parseAbi } from 'viem'
import { sepolia } from 'viem/chains'
import { erc721Abi } from '@/lib/abis'
import { genesisImagePath, revertedAsNull } from '@/lib/reads'

const nonexistent = encodeErrorResult({ abi: parseAbi(['error ERC721NonexistentToken(uint256 tokenId)']), errorName: 'ERC721NonexistentToken', args: [42n] })

// A client whose node answers eth_call the way a real node does for a revert, or fails like a dead RPC.
type Mode = 'revert' | 'bare-revert' | 'down'
const client = (mode: Mode) => createPublicClient({
  chain: sepolia,
  transport: custom({
    async request({ method }) {
      if (method !== 'eth_call') throw new Error(`unexpected ${method}`)
      if (mode === 'revert') throw Object.assign(new Error('execution reverted'), { code: 3, data: nonexistent })
      if (mode === 'bare-revert') throw Object.assign(new Error('execution reverted'), { code: -32000 })
      throw Object.assign(new Error('upstream unavailable'), { code: -32603 })
    },
  }, { retryCount: 0 }),
})
const ownerOf = (mode: Mode) =>
  client(mode).readContract({ address: '0xCB98349c134aB983dA5BfD80527dfe2552bDB70F', abi: erc721Abi, functionName: 'ownerOf', args: [42n] })

describe('revertedAsNull', () => {
  it('turns a contract revert (token does not exist) into null', async () => {
    await expect(revertedAsNull(ownerOf('revert'))).resolves.toBeNull()
    await expect(revertedAsNull(ownerOf('bare-revert'))).resolves.toBeNull()
  })
  it('rethrows RPC failures so they are never shown as a missing token', async () => {
    await expect(revertedAsNull(ownerOf('down'))).rejects.toThrow()
  })
  it('passes values through', async () => {
    await expect(revertedAsNull(Promise.resolve(7))).resolves.toBe(7)
  })
})

describe('genesisImagePath', () => {
  it('versions artwork by level so a merge refreshes cached art', () => {
    expect(genesisImagePath(42n, 3)).toBe('/api/squeeks/42/image?v=w2&l=3')
    expect(genesisImagePath(42n, null)).toBe('/api/squeeks/42/image?v=w2')
  })
})
