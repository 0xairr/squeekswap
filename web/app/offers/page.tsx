'use client'

import { useState } from 'react'
import { NotDeployed, OfferRow } from '@/components/Bits'
import { networkName } from '@/lib/format'
import { useActiveSwap, useOffers } from '@/lib/hooks'

export default function AllOffers() {
  const { chainId, deployment } = useActiveSwap()
  const offers = useOffers(chainId)
  const [showAll, setShowAll] = useState(false)
  if (!deployment) return <NotDeployed chainId={chainId} />
  const list = (offers.data?.records ?? []).filter((record) => showAll || record.status === 'open')
  return <div className="stack"><section className="intro"><span className="eyebrow">PUBLIC LEDGER · {networkName(chainId)}</span><h1>Offer book.</h1><p>Every SqueekSwap offer is reconstructed from contract events and checked against current onchain state before acceptance.</p></section><section className="section"><div className="section-head"><h2>{showAll ? 'All offers' : 'Open offers'}</h2><span className="count">{list.length.toString().padStart(2, '0')}</span></div><label className="checkline"><input type="checkbox" checked={showAll} onChange={(event) => setShowAll(event.target.checked)} /> Include filled, cancelled, withdrawn, and expired offers</label>{offers.data?.warning ? <p className="note">{offers.data.warning}</p> : null}{offers.isLoading ? <p className="note">Loading offers…</p> : null}{offers.error ? <p className="error">{(offers.error as Error).message}</p> : null}{offers.data && list.length === 0 ? <p className="note">No offers to show.</p> : null}{list.map((record) => <OfferRow key={record.id.toString()} record={record} chainId={chainId} />)}</section></div>
}
