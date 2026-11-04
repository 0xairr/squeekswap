'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useConfig, useConnection } from 'wagmi'
import { NotDeployed, OfferRow, PAGE_SIZE, ShowMore, SqueekCard, TxStatus } from '@/components/Bits'
import { SeedsStrip } from '@/components/Seeds'
import { SwapPoster } from '@/components/SwapPoster'
import { cancelOffer, revokeAllOffers } from '@/lib/actions'
import { same } from '@/lib/format'
import { useActiveSwap, useChecks, useHoldings, useOffers, useTx } from '@/lib/hooks'
import { assetKey, listableForTaker, splitOffers } from '@/lib/offers'
import { asChainId } from '@/lib/wagmi'

export default function Home() {
  const config = useConfig()
  const { address } = useConnection()
  const { chainId, deployment } = useActiveSwap()
  const chain = asChainId(chainId)
  const holdings = useHoldings(chainId, address)
  const [shown, setShown] = useState(PAGE_SIZE)
  const offers = useOffers(chainId)
  const records = offers.data?.records ?? []
  // Wallet-held Genesis NFTs, so public offers asking for them also reach this inbox.
  const held = new Set((holdings.data ?? []).filter((holding) => holding.custody === 'wallet').map((holding) => assetKey({ collection: deployment?.squeeks ?? '0x', tokenId: holding.id })))
  const { toMe, mine } = splitOffers(records, address, { official: deployment?.squeeks, held })
  const checks = useChecks(chainId, toMe, address)
  const tx = useTx()

  if (!deployment || !chain) return <NotDeployed chainId={chainId} />
  const listed = toMe.filter((record) => checks.data && listableForTaker(checks.data[record.id.toString()]))
  const tradedWith = new Set(records.filter((record) => record.status === 'filled' && address).flatMap((record) => same(record.offer.maker, address) ? [record.filledBy] : same(record.filledBy, address) ? [record.offer.maker] : []).map((item) => item?.toLowerCase()))
  const myOrphans = (offers.data?.orphans ?? []).filter((orphan) => same(orphan.maker, address))

  return (
    <div className="stack">
      <section className="hero">
        <div><h1>Trade Squeeks with other holders.</h1><p>Pick the exact Genesis IDs on both sides. Everything swaps in one transaction, or nothing moves. Your NFTs stay in your wallet until then, and there is no fee.</p><div className="row-actions"><Link className="btn" href="/new">Make an offer <span aria-hidden="true">↗</span></Link><Link className="btn ghost" href="/offers">Browse offers</Link></div></div>
        <SwapPoster />
      </section>

      <SeedsStrip />
      {offers.data?.warning ? <p className="note">{offers.data.warning}</p> : null}

      {!address ? null : (
        <>
          <section className="section"><div className="section-head"><div><span className="eyebrow">INBOX</span><h2>Offers to you</h2></div><span className="count">{listed.length.toString().padStart(2, '0')}</span></div>
            {(offers.isLoading || (toMe.length > 0 && checks.isLoading)) ? <p className="note">Loading offers…</p> : null}
            {offers.error ? <p className="error">{(offers.error as Error).message}</p> : null}
            {offers.data && !checks.isLoading && listed.length === 0 ? <p className="note">No fillable offers currently name this wallet or ask for its Genesis NFTs.</p> : null}
            {listed.map((record) => <OfferRow key={record.id.toString()} record={record} chainId={chainId} tag={tradedWith.has(record.offer.maker.toLowerCase()) ? undefined : 'NEW WALLET'} />)}
          </section>

          <section className="section"><div className="section-head"><div><span className="eyebrow">OUTBOX</span><h2>Your open offers</h2></div><span className="count">{(mine.length + myOrphans.length).toString().padStart(2, '0')}</span></div>
            {offers.data && mine.length === 0 && myOrphans.length === 0 ? <p className="note">You have no open offers.</p> : null}
            {mine.map((record) => <OfferRow key={record.id.toString()} record={record} chainId={chainId} />)}
            {myOrphans.map((orphan) => <div key={orphan.id.toString()} className="offer-row"><div><p className="what">Offer {orphan.id.toString()}</p><p className="meta">EVENT BODY UNAVAILABLE · CAN STILL CANCEL</p></div><button type="button" className="btn ghost" disabled={tx.busy} onClick={() => tx.run(`Cancel offer ${orphan.id}`, () => cancelOffer(config, chain, deployment, orphan.id))}>Cancel</button></div>)}
            {mine.some((record) => record.status === 'open') ? <div className="row-actions"><button type="button" className="btn ghost" disabled={tx.busy} onClick={() => tx.run('Withdraw all offers', () => revokeAllOffers(config, chain, deployment), 'offer')}>Withdraw all offers</button><span className="note">One transaction invalidates every open offer you made.</span></div> : null}
          </section>

          <section className="section"><div className="section-head"><div><span className="eyebrow">COLLECTION</span><h2>Your Squeeks</h2></div><span className="count">{(holdings.data?.length ?? 0).toString().padStart(2, '0')}{holdings.complete ? '' : '+'}</span></div>
            {holdings.isLoading ? <p className="note">Loading your Squeeks…</p> : null}
            {holdings.error ? <p className="error">{(holdings.error as Error).message}</p> : null}
            {holdings.data?.length === 0 ? <p className="note">This wallet has no Squeeks.</p> : null}
            <div className="grid">{holdings.data?.slice(0, shown).map((holding) => <SqueekCard key={holding.id.toString()} chainId={chainId} id={holding.id} level={holding.level} custody={holding.custody} />)}</div>
            <ShowMore shown={Math.min(shown, holdings.data?.length ?? 0)} total={holdings.data?.length ?? 0} complete={holdings.complete} onMore={() => setShown((n) => n + PAGE_SIZE)} />
          </section>
          <TxStatus state={tx.state} chainId={chainId} />
        </>
      )}
    </div>
  )
}
