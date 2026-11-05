'use client'

import Link from 'next/link'
import { useState } from 'react'
import { NotDeployed, OfferRow } from '@/components/Bits'
import type { OfferRecord } from '@/lib/chain'
import { networkName } from '@/lib/format'
import { useActiveSwap, useOffers } from '@/lib/hooks'

type Tab = 'open' | 'history' | 'closed'

const TABS: { key: Tab; label: string; empty: string }[] = [
  { key: 'open', label: 'Open offers', empty: 'No open offers right now. Make the first one.' },
  { key: 'history', label: 'Swap history', empty: 'No swaps yet. Completed swaps appear here.' },
  { key: 'closed', label: 'Closed', empty: 'Nothing cancelled, withdrawn or expired.' },
]

const inTab = (record: OfferRecord, tab: Tab) =>
  tab === 'open' ? record.status === 'open' : tab === 'history' ? record.status === 'filled' : record.status !== 'open' && record.status !== 'filled'

/** Newest first: swaps by when they happened, everything else by offer number. */
const newest = (tab: Tab) => (a: OfferRecord, b: OfferRecord) =>
  tab === 'history' && a.filledAt !== undefined && b.filledAt !== undefined ? b.filledAt - a.filledAt : a.id < b.id ? 1 : a.id > b.id ? -1 : 0

export default function AllOffers() {
  const { chainId, deployment } = useActiveSwap()
  const offers = useOffers(chainId)
  const [tab, setTab] = useState<Tab>('open')
  if (!deployment) return <NotDeployed chainId={chainId} />
  const records = offers.data?.records ?? []
  const count = (key: Tab) => records.filter((record) => inTab(record, key)).length
  const swaps = records.filter((record) => record.status === 'filled')
  const traded = swaps.reduce((sum, record) => sum + record.offer.give.length + record.offer.want.length, 0)
  const list = records.filter((record) => inTab(record, tab)).sort(newest(tab))
  const active = TABS.find((item) => item.key === tab)!

  return (
    <div className="stack tight">
      <section className="book-head">
        <div>
          <h1 className="page-title">Offer book</h1>
          <p className="note">Every offer and swap on {networkName(chainId)}, read from the SqueekSwap contract and re-checked onchain before anyone accepts.</p>
        </div>
        <dl className="book-stats">
          <div><dt>Open offers</dt><dd>{offers.data ? count('open') : '–'}</dd></div>
          <div><dt>Swaps done</dt><dd>{offers.data ? swaps.length : '–'}</dd></div>
          <div><dt>Squeeks traded</dt><dd>{offers.data ? traded : '–'}</dd></div>
        </dl>
      </section>

      <section className="book">
        <div className="tabs" role="tablist" aria-label="Offer lists">
          {TABS.map((item) => (
            <button key={item.key} type="button" role="tab" id={`tab-${item.key}`} aria-controls="offer-list" aria-selected={tab === item.key} className="tab" onClick={() => setTab(item.key)}>
              {item.label}<span className="tab-count">{offers.data ? count(item.key) : ''}</span>
            </button>
          ))}
          <Link className="btn tabs-cta" href="/new">Make an offer</Link>
        </div>
        <div id="offer-list" role="tabpanel" aria-labelledby={`tab-${tab}`} className="trade-list">
          {offers.data?.warning ? <p className="note">{offers.data.warning}</p> : null}
          {offers.isLoading ? <p className="note">Loading offers…</p> : null}
          {offers.error ? <p className="error">{(offers.error as Error).message}</p> : null}
          {offers.data && list.length === 0 ? <p className="empty-state">{active.empty}</p> : null}
          {list.map((record) => <OfferRow key={record.id.toString()} record={record} chainId={chainId} />)}
        </div>
      </section>
    </div>
  )
}
