import { roundOf } from './seeds'
import { fetchUpstream } from './upstream'

type Status = { measurement?: { freshness?: string; coreStatus?: string; rpmMilli?: number; observedAt?: string } }
export type Wheel = { running: boolean; status: string; rpm: number; fresh: boolean; observedAt: string | null; round: string }

/**
 * Live hint only: whether Squeektoshi is on the wheel now. The Zoomies bonus itself is decided onchain.
 * Works in the browser too (the Squeekchain API allows any origin); browsers are not bot-challenged the way
 * cloud servers are.
 */
export async function readWheel(): Promise<Wheel> {
  const response = await fetchUpstream('https://api.squeekchain.com/v1/status', { headers: { accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(8_000) })
  if (!response.ok) throw new Error(`Squeekchain status returned HTTP ${response.status}.`)
  const m = ((await response.json()) as Status).measurement ?? {}
  const status = m.coreStatus ?? 'UNKNOWN'
  const fresh = m.freshness === 'online'
  return { running: fresh && status === 'SPINNING', status, rpm: Math.round((m.rpmMilli ?? 0) / 1000), fresh, observedAt: m.observedAt ?? null, round: roundOf(Math.floor(Date.now() / 1000)).toString() }
}
