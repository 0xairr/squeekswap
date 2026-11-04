'use client'

import Link from 'next/link'
import { useConnection } from 'wagmi'
import { NotDeployed } from '@/components/Bits'
import { SeedMark } from '@/components/Marks'
import { WheelBadge } from '@/components/Seeds'
import { addressUrl, shortAddress, same } from '@/lib/format'
import { useActiveSwap, useSeeds, type SeedsHistory } from '@/lib/hooks'

const REASONS: Record<SeedsHistory['reason'], string> = {
  scored: 'Earned',
  'daily-cap': 'Daily cap reached',
  'pair-today': 'Same partner today',
  cooldown: 'NFTs on cooldown',
}

export default function SeedsPage() {
  const { address } = useConnection()
  const { chainId, deployment } = useActiveSwap()
  const seeds = useSeeds(chainId, address)
  if (!deployment) return <NotDeployed chainId={chainId} />
  const rules = seeds.data?.rules
  const me = seeds.data?.wallet
  const cooldownDays = rules ? rules.nftCooldownSeconds / 86_400 : 3

  return (
    <div className="stack">
      <section className="intro"><span className="official-badge"><SeedMark /> SEEDS · SQUEEKSWAP POINTS</span><h1>Seeds.</h1><p>Every completed Genesis swap earns Seeds for both wallets. A swap that lands while Squeektoshi is on his wheel earns double.</p><WheelBadge /></section>

      {address ? (
        <section className="seeds-me" aria-label="Your Seeds">
          <div><span className="lab">YOUR SEEDS</span><b className="seeds-big">{me?.seeds ?? 0}</b></div>
          <div><span className="lab">RANK</span><b>{me?.rank ? `#${me.rank}` : '—'}</b></div>
          <div><span className="lab">SCORED SWAPS</span><b>{me?.swaps ?? 0}</b></div>
          <div><span className="lab">ZOOMIES SWAPS</span><b>{me?.zoomies ?? 0}</b></div>
          <div><span className="lab">TODAY (UTC)</span><b>{me?.scoredToday ?? 0}/{rules?.dailyCap ?? 3}</b></div>
        </section>
      ) : <section className="empty-callout"><span className="eyebrow">YOUR SEEDS</span><h2>Connect a wallet to see your Seeds.</h2></section>}

      {me && me.history.length > 0 ? (
        <section className="section"><div className="section-head"><div><span className="eyebrow">HISTORY</span><h2>Your swaps</h2></div></div>
          {me.history.map((swap) => (
            <div key={swap.id} className="offer-row">
              <div><p className="what">Offer {swap.id} · {swap.nfts} NFT{swap.nfts === 1 ? '' : 's'}{swap.zoomies === 'yes' ? <span className="tag">ZOOMIES ×2</span> : null}{swap.zoomies === 'pending' ? <span className="tag">ZOOMIES PENDING</span> : null}</p><p className="meta">{new Date(swap.time * 1000).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })} · {REASONS[swap.reason]}</p></div>
              <div className="row-actions"><b className="seeds-delta">{swap.seeds > 0 ? `+${swap.seeds}` : '0'} <SeedMark /></b><Link className="btn ghost" href={`/offer/${chainId}/${swap.id}`}>View</Link></div>
            </div>
          ))}
        </section>
      ) : null}

      <section className="section"><div className="section-head"><div><span className="eyebrow">HOW IT WORKS</span><h2>Earning Seeds</h2></div></div>
        <ol className="soon-list seeds-rules">
          <li><b>Swap Genesis</b><span>Both wallets earn {rules?.base ?? 10} Seeds for every completed swap of official Squeek Genesis NFTs.</span></li>
          <li><b>Bigger bundles</b><span>+{rules?.perExtraNft ?? 2} Seeds for every NFT beyond the first two, counting both sides (up to 8 per side).</span></li>
          <li><b>Zoomies ×{rules?.zoomies ?? 2}</b><span>If Squeektoshi ran on his wheel during the 10-minute round your swap landed in, the swap pays double. This is read from SqueekCore onchain and confirmed once the round settles.</span></li>
          <li><b>Fair play</b><span>Up to {rules?.dailyCap ?? 3} scored swaps per wallet per UTC day, one scored swap per wallet pair per day, and each NFT earns at most once every {cooldownDays} days, whoever holds it.</span></li>
        </ol>
        <p className="note">Seeds are SqueekSwap points computed from public chain data. They are not Squeekchain Aura.</p>
      </section>

      <section className="section"><div className="section-head"><div><span className="eyebrow">LEADERBOARD</span><h2>Top stashes</h2></div><span className="count">{(seeds.data?.leaderboard.length ?? 0).toString().padStart(2, '0')}</span></div>
        {seeds.isLoading ? <p className="note">Counting Seeds…</p> : null}
        {seeds.error ? <p className="error">{(seeds.error as Error).message}</p> : null}
        {seeds.data && seeds.data.leaderboard.length === 0 ? <p className="note">No Seeds earned yet. Complete the first Genesis swap to top the board.</p> : null}
        {seeds.data && seeds.data.leaderboard.length > 0 ? (
          <table className="seeds-table">
            <thead><tr><th>#</th><th>Wallet</th><th>Seeds</th><th>Swaps</th><th>Zoomies</th></tr></thead>
            <tbody>{seeds.data.leaderboard.map((entry) => {
              const url = addressUrl(chainId, entry.wallet)
              return <tr key={entry.wallet} className={same(entry.wallet, address) ? 'me' : undefined}><td>{entry.rank}</td><td className="mono">{url ? <a href={url} target="_blank" rel="noreferrer">{shortAddress(entry.wallet)}</a> : shortAddress(entry.wallet)}</td><td><b>{entry.seeds}</b></td><td>{entry.swaps}</td><td>{entry.zoomies}</td></tr>
            })}</tbody>
          </table>
        ) : null}
      </section>
    </div>
  )
}
