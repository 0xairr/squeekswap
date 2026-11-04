import { describe, expect, it } from 'vitest'
import type { Address } from 'viem'
import { fromWire, toWire } from '@/lib/wire'

describe('offer JSON wire format', () => {
  it('round-trips bigint fields without precision loss', () => {
    const offer = {
      maker: '0x1111111111111111111111111111111111111111' as Address,
      taker: '0x2222222222222222222222222222222222222222' as Address,
      expiry: 18_446_744_073_709_551_000n,
      nonce: 9n,
      give: [
        { collection: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address, tokenId: 1n },
        { collection: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address, tokenId: 9_007_199_254_740_993n },
      ],
      want: [{ collection: '0xcccccccccccccccccccccccccccccccccccccccc' as Address, tokenId: 9999n }],
    }
    expect(fromWire(toWire(offer))).toEqual(offer)
  })
})
