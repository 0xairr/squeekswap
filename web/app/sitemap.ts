import type { MetadataRoute } from 'next'

const SITE = 'https://www.squeekswap.xyz'

export default function sitemap(): MetadataRoute.Sitemap {
  return ['', '/new', '/offers', '/seeds', '/vault', '/docs'].map((path) => ({ url: `${SITE}${path}`, changeFrequency: 'daily' }))
}
