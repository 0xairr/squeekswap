import Home from '@/components/HomeClient'

// Rendered per request: a prerendered page answers byte-range requests with 206, which Squeekchain's
// site check rejects. A dynamic response is always a full 200.
export const dynamic = 'force-dynamic'

export default function Page() {
  return <Home />
}
