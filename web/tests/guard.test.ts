import { describe, expect, it } from 'vitest'
import { clientKey, createLimiter, isCrossSite } from '@/lib/guard'

describe('createLimiter', () => {
  it('allows the limit in a window, then refuses until the window ends', () => {
    let t = 0
    const hit = createLimiter(3, 60_000, () => t)
    expect([hit('a'), hit('a'), hit('a')].every((r) => r.ok)).toBe(true)
    const refused = hit('a')
    expect(refused.ok).toBe(false)
    expect(refused.retryAfter).toBe(60)
    expect(hit('b').ok).toBe(true)
    t = 60_000
    expect(hit('a').ok).toBe(true)
  })
  it('does not reset anyone when flooded with new keys', () => {
    const t = 0
    const hit = createLimiter(2, 60_000, () => t, 5)
    hit('victim')
    hit('victim')
    for (let i = 0; i < 50; i++) hit(`spoof-${i}`)
    expect(hit('victim').ok).toBe(false)
  })
  it('puts new keys on one shared budget while full', () => {
    const t = 0
    const hit = createLimiter(3, 60_000, () => t, 2)
    hit('a')
    hit('b')
    expect([hit('c').ok, hit('d').ok, hit('e').ok, hit('f').ok]).toEqual([true, true, true, false])
  })
  it('makes room again once old windows expire', () => {
    let t = 0
    const hit = createLimiter(1, 60_000, () => t, 1)
    hit('a')
    t = 60_000
    expect(hit('b').ok).toBe(true)
    expect(hit('b').ok).toBe(false)
  })
  it('lets one request spend several units, as a batched RPC call does', () => {
    const hit = createLimiter(10, 60_000, () => 0)
    expect(hit('a', 8).ok).toBe(true)
    expect(hit('a', 3).ok).toBe(false)
  })
})

describe('request checks', () => {
  const req = (headers: Record<string, string>) => new Request('https://desk.example/api/holdings', { headers })
  it('keys a client by the address its proxy saw, which the client cannot choose', () => {
    expect(clientKey(req({ 'x-real-ip': '198.51.100.2', 'x-forwarded-for': '1.2.3.4, 198.51.100.2' }))).toBe('198.51.100.2')
    // A client can prepend anything; the last hop is the one the nearest proxy added.
    expect(clientKey(req({ 'x-forwarded-for': '1.2.3.4, 203.0.113.7' }))).toBe('203.0.113.7')
    expect(clientKey(req({}))).toBe('unknown')
  })
  it('flags browser requests from other sites, and lets scripts and agents through', () => {
    expect(isCrossSite(req({ 'sec-fetch-site': 'cross-site' }))).toBe(true)
    expect(isCrossSite(req({ 'sec-fetch-site': 'same-origin' }))).toBe(false)
    expect(isCrossSite(req({}))).toBe(false)
  })
})
