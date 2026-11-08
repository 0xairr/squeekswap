import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchOffer, fetchOffers, readOffersFresh } from '@/lib/chain'

function stubFetch() {
  const urls: string[] = []
  vi.stubGlobal('fetch', async (url: string) => {
    urls.push(url)
    return url.startsWith('/api/offers?')
      ? Response.json({ offers: [], orphans: [], warning: null })
      : Response.json({ error: 'No such offer.' }, { status: 404 })
  })
  return urls
}

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('offer reads after a transaction', () => {
  it('skip the cached index for a short while, then use it again', async () => {
    vi.useFakeTimers()
    const urls = stubFetch()
    await fetchOffer(11155111, 8n)
    readOffersFresh()
    await fetchOffer(11155111, 8n)
    await fetchOffers(11155111)
    vi.advanceTimersByTime(60_000)
    await fetchOffer(11155111, 8n)
    expect(urls).toEqual([
      '/api/offers/11155111/8',
      '/api/offers/11155111/8?fresh=1',
      '/api/offers?chainId=11155111&fresh=1',
      '/api/offers/11155111/8',
    ])
  })
})
