'use client'

import Link from 'next/link'
import { useWheel } from '@/lib/hooks'
import { HamsterMark, SeedMark } from './Marks'

/**
 * Live hint of Squeektoshi's wheel, read from the browser. The Zoomies bonus itself is decided from SqueekCore
 * onchain. After a failed refresh the last known status stays on screen; with none it says so plainly.
 */
export function WheelBadge() {
  const wheel = useWheel()
  if (!wheel.data) {
    return wheel.isError
      ? <p className="wheel-badge idle"><HamsterMark size={16} /> Wheel status unavailable right now</p>
      : <p className="wheel-badge idle"><HamsterMark size={16} /> Reading Squeektoshi’s wheel</p>
  }
  return wheel.data.running
    ? <p className="wheel-badge running"><HamsterMark size={16} /> Squeektoshi is running · {wheel.data.rpm} RPM · swaps now earn ×2 Seeds</p>
    : <p className="wheel-badge idle"><HamsterMark size={16} /> Squeektoshi is resting · swaps earn normal Seeds</p>
}

/** Compact live status for the header. */
export function WheelPill() {
  const wheel = useWheel()
  const running = !!wheel.data?.running
  const label = !wheel.data ? 'Squeektoshi' : running ? 'Running · ×2 Seeds' : 'Resting'
  return (
    <Link href="/seeds" className={`wheel-pill${running ? ' running' : ''}`} title="Squeektoshi, the hamster whose wheel powers Squeekchain">
      <HamsterMark size={16} /><span>{label}</span>
    </Link>
  )
}

/** Home-page entry point to Seeds. */
export function SeedsStrip() {
  return (
    <section className="seeds-strip">
      <div><span className="official-badge"><SeedMark /> SEEDS</span><p>Each completed Genesis swap earns Seeds. A swap that lands while Squeektoshi is on his wheel earns double.</p></div>
      <WheelBadge />
      <Link className="btn" href="/seeds">See Seeds <span aria-hidden="true">↗</span></Link>
    </section>
  )
}
