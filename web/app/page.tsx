import Home from '@/components/HomeClient'

// Rendered per request: a prerendered page answers byte-range requests with 206, which Squeekchain's
// site check rejects. A dynamic response is always a full 200.
export const dynamic = 'force-dynamic'

// Tells Google the site's name, so results read "SqueekSwap" instead of the bare domain.
const siteJsonLd = { '@context': 'https://schema.org', '@type': 'WebSite', name: 'SqueekSwap', url: 'https://www.squeekswap.xyz/' }

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(siteJsonLd) }} />
      <Home />
    </>
  )
}
