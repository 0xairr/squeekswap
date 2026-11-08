'use client'

import { useMemo, useState } from 'react'
import { useSqueekchainRates } from '@/lib/hooks'
import { estimate, houseAfter } from '@/lib/vault-calc'
import { LEVEL_POWER, type VaultStats } from '@/lib/vault'

const FALLBACK_SQK_PER_BLOCK = 3674
/** Squeekchain's whitepaper figure for the wheel's long-run average. */
const LONG_RUN_PACE = 1078
type PaceKey = 'recent' | 'relaunch' | 'longrun'
const AGES = [
  { label: 'Brand new', days: 0 },
  { label: '3 days', days: 3 },
  { label: '1 week', days: 7 },
] as const

const fmt = (n: number) => Math.round(n).toLocaleString('en-US')

function Choice<T extends string | number>({ label, options, value, onChange }: { label: string; options: readonly { label: string; value: T }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="calc-choice-row" role="group" aria-label={label}>
      <span className="calc-label">{label}</span>
      <span className="segmented">
        {options.map((o) => <button key={o.label} type="button" aria-pressed={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>{o.label}</button>)}
      </span>
    </div>
  )
}

export function VaultCalculator({ stats }: { stats?: VaultStats }) {
  const rates = useSqueekchainRates()
  const sqkPerBlock = rates.data?.sqkPerBlock ?? FALLBACK_SQK_PER_BLOCK
  const [count, setCount] = useState(1)
  const [level, setLevel] = useState(1)
  const [days, setDays] = useState(7)
  const [size, setSize] = useState(() => Math.max(50, stats?.lockedCount ?? 0))
  const [age, setAge] = useState(3)
  const [paceKey, setPaceKey] = useState<PaceKey>('recent')
  const paces: Record<PaceKey, { label: string; blocks: number | null }> = {
    recent: { label: 'Last 3 days', blocks: rates.data?.lastThreeDaysPerDay ?? null },
    relaunch: { label: 'Since relaunch', blocks: rates.data?.sinceRelaunchPerDay ?? null },
    longrun: { label: 'Long-run', blocks: LONG_RUN_PACE },
  }
  const pace = paces[paceKey].blocks ?? LONG_RUN_PACE

  // The rest of Squeekchain is held at today's staking power.
  const otherPower = stats ? Math.max(1, stats.networkPower - stats.vaultWeight) : 8_400_000
  const myPower = count * LEVEL_POWER[level - 1]
  const result = useMemo(() => {
    const vaultPower = size * LEVEL_POWER[0]
    const houseSqk = houseAfter(vaultPower, 0, otherPower, sqkPerBlock, pace, age)
    return estimate({ myPower, vaultPower, houseSqk, otherPower, sqkPerBlock, blocksPerDay: pace, days })
  }, [size, otherPower, sqkPerBlock, pace, age, myPower, days])

  const alone = result.alone[days]
  const cheeks = result.vault[days]
  const top = Math.max(alone, cheeks, 1)
  const diff = alone > 0 ? Math.round((cheeks / alone - 1) * 100) : 0
  const verdict = result.aheadOnDay === null
    ? `Staking alone earns more over ${days} ${days === 1 ? 'day' : 'days'}.`
    : result.aheadOnDay === 1
      ? 'The vault earns more from day one.'
      : `The vault pulls ahead on day ${result.aheadOnDay}.`

  return (
    <section className="calc" aria-labelledby="calc-title">
      <div className="calc-head">
        <h2 id="calc-title">What would I earn?</h2>
        <p>Your Squeeks staked alone, or locked in the vault.</p>
      </div>

      <div className="calc-grid">
        <div className="calc-controls">
          <p className="calc-sentence">
            Lock
            <select aria-label="How many Squeeks" value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {[1, 2, 3, 5, 10, 20].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            level
            <select aria-label="Level" value={level} onChange={(e) => setLevel(Number(e.target.value))}>
              {LEVEL_POWER.map((_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
            </select>
            {count === 1 ? 'Squeek' : 'Squeeks'} for
            <select aria-label="Days" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {[1, 3, 7, 14, 30].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            {days === 1 ? 'day' : 'days'}
          </p>

          <label className="calc-slider">
            <span className="calc-label">Squeeks already in the vault <b>{size}</b>{stats ? <small> (now: {stats.lockedCount})</small> : null}</span>
            <input type="range" min={1} max={500} value={size} onChange={(e) => setSize(Number(e.target.value))} />
          </label>

          <Choice label="Vault running for" options={AGES.map((a) => ({ label: a.label, value: a.days }))} value={age} onChange={setAge} />
          <div className="calc-choice-row">
            <Choice label="How much Squeektoshi runs" options={(Object.keys(paces) as PaceKey[]).map((key) => ({ label: paces[key].label, value: key }))} value={paceKey} onChange={setPaceKey} />
            <span className="calc-label">{paces[paceKey].blocks === null ? (rates.isLoading ? 'Loading from Squeekchain…' : 'Not available right now; using 1,078') : `${fmt(pace)} blocks a day${paceKey === 'longrun' ? ', Squeekchain’s whitepaper figure' : ', live from Squeekchain'}`}</span>
          </div>
        </div>

        <div className="calc-result" aria-live="polite">
          <div className="calc-bar">
            <span className="calc-bar-label">Staking alone</span>
            <span className="calc-bar-track"><span className="calc-bar-fill alone" style={{ width: `${(alone / top) * 100}%` }} /></span>
            <b>{fmt(alone)} SQK</b>
          </div>
          <div className="calc-bar">
            <span className="calc-bar-label">In the cheeks</span>
            <span className="calc-bar-track"><span className="calc-bar-fill cheeks" style={{ width: `${(cheeks / top) * 100}%` }} /></span>
            <b>{fmt(cheeks)} SQK</b>
          </div>
          <p className="calc-verdict">{verdict} <span className={diff >= 0 ? 'up' : 'down'}>{diff >= 0 ? '+' : ''}{diff}%</span></p>
          <p className="note">Estimate from live Squeekchain numbers ({fmt(sqkPerBlock)} SQK per block, {fmt(pace)} blocks a day). A new, small vault pays less than staking alone at first; it pulls ahead as Squeeks and the house stake build up.</p>
        </div>
      </div>
    </section>
  )
}
