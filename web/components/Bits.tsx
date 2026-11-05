'use client'

import Link from 'next/link'
import { memo, useEffect, useRef, useState } from 'react'
import { zeroAddress } from 'viem'
import { useConnection } from 'wagmi'
import type { OfferRecord } from '@/lib/chain'
import { CANONICAL_SQUEEK, deploymentFor } from '@/lib/deployments'
import { networkName, shortAddress, timeAgo, timeLeft, txUrl, who } from '@/lib/format'
import { type TxState, useNftInfo } from '@/lib/hooks'
import { assetKey, isOfficial, unofficialAssets, type Asset, type OfferStatus } from '@/lib/offers'
import type { Custody, NftInfo } from '@/lib/nfts'
import { genesisImagePath } from '@/lib/reads'
import { HamsterMark } from './Marks'

/** The one collection the website supports. Everything else is shown as unofficial. */
export const officialFor = (chainId: number) => deploymentFor(chainId)?.squeeks ?? CANONICAL_SQUEEK

/** Card artwork with a drawn hamster placeholder while loading or if the image fails, never a broken icon. */
function Art({ src, alt, label }: { src?: string; alt: string; label: string }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [src])
  if (!src || failed) return <span className="noimg" aria-label={label}><HamsterMark size={56} /></span>
  return <img src={src} alt={alt} width={320} height={320} loading="lazy" decoding="async" fetchPriority="low" onError={() => setFailed(true)} />
}

function useNearViewport() {
  const ref = useRef<HTMLElement | null>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const node = ref.current
    if (!node || visible) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true)
        observer.disconnect()
      }
    }, { rootMargin: '240px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [visible])
  return { ref, visible }
}

type SqueekCardProps = {
  chainId: number
  id: bigint
  level?: number | null
  custody?: Custody
  caption?: string
  selected?: boolean
  disabled?: boolean
  onToggle?: () => void
}

function SqueekCardView(props: SqueekCardProps) {
  const { level, custody } = props
  // A ~20 KB thumbnail rendered once on the server from the onchain artwork and cached by the CDN.
  const body = (
    <>
      <span className="squeek-art">
        <Art src={genesisImagePath(props.id, level ?? null)} alt={`Squeek Genesis #${props.id}`} label={`Squeek Genesis #${props.id}`} />
        {/* A selected card is still a toggle: the flag shows a tick, and on hover or focus says what a click does. */}
        {props.selected && props.onToggle ? <span className="pick-flag" aria-hidden="true"><span className="on">✓</span><span className="off">✕ Remove</span></span> : null}
      </span>
      <span className="squeek-line"><span className="squeek-id">#{props.id.toString()}</span>{level ? <span className="level">LVL {level}</span> : null}</span>
      {custody === 'staking' ? <span className="custody">STAKED · WITHDRAW TO SWAP</span> : null}
      {custody === 'unclaimed' ? <span className="custody">UNCLAIMED · NOT TRADABLE YET</span> : null}
      {props.caption ? <span className="squeek-cap">{props.caption}</span> : null}
    </>
  )
  if (props.onToggle) {
    return <button type="button" className="squeek-card" aria-pressed={!!props.selected} disabled={props.disabled} onClick={props.onToggle}>{body}</button>
  }
  return <div className="squeek-card">{body}</div>
}

/**
 * Memoized: selecting one card re-renders only that card, not the whole grid. `onToggle` is ignored in the
 * comparison, so callers must use functional state updates (no stale state is captured in the handler).
 */
export const SqueekCard = memo(SqueekCardView, (a, b) =>
  a.chainId === b.chainId && a.id === b.id && a.level === b.level && a.custody === b.custody
  && a.caption === b.caption && a.selected === b.selected && a.disabled === b.disabled && !!a.onToggle === !!b.onToggle)

/** Big wallets hold hundreds of Squeeks; grids render a page at a time instead of every card at once. */
export const PAGE_SIZE = 24

export function ShowMore({ shown, total, complete = true, onMore }: { shown: number; total: number; complete?: boolean; onMore: () => void }) {
  if (total === 0 || (shown >= total && complete)) return null
  const count = complete ? `${total}` : `${total}+`
  return <div className="row-actions">{shown < total ? <button type="button" className="btn ghost" onClick={onMore}>Show {Math.min(PAGE_SIZE, total - shown)} more</button> : <span className="note">Loading the rest of this wallet…</span>}<span className="note">Showing {shown} of {count}</span></div>
}

export function NftCard(props: {
  chainId: number
  asset: Asset
  info?: NftInfo
  caption?: string
  selected?: boolean
  disabled?: boolean
  onToggle?: () => void
}) {
  const near = useNearViewport()
  const official = isOfficial(props.asset, officialFor(props.chainId))
  // Metadata and art of other contracts are never fetched: their names and pictures can imitate Genesis.
  const details = useNftInfo(props.chainId, props.asset, near.visible && !props.info && official)
  const info = official ? props.info ?? details.data : undefined
  // Wait for the level so the thumbnail URL (which carries it) is requested once.
  const art = official && info ? genesisImagePath(props.asset.tokenId, info.level ?? null) : undefined
  const body = (
    <>
      <span className="squeek-art">
        {official
          ? <Art src={art} alt={`Squeek Genesis #${props.asset.tokenId}`} label={`Squeek Genesis #${props.asset.tokenId}`} />
          : <span className="noimg" aria-label={`Unofficial NFT #${props.asset.tokenId}`}>NFT<br />#{props.asset.tokenId.toString()}</span>}
      </span>
      <span className="squeek-line"><span className="squeek-id">#{props.asset.tokenId.toString()}</span>{info?.level ? <span className="level">LVL {info.level}</span> : null}</span>
      {official
        ? <span className="collection-name" title={props.asset.collection}>Official Squeek Genesis</span>
        : <><span className="unofficial-badge">NOT OFFICIAL GENESIS</span><span className="collection-name mono" title={props.asset.collection}>{props.asset.collection}</span></>}
      {info?.custody === 'staking' ? <span className="custody">STAKED · WITHDRAW TO SWAP</span> : null}
      {info?.custody === 'unclaimed' ? <span className="custody">UNCLAIMED · NOT TRADABLE YET</span> : null}
      {props.caption ? <span className="squeek-cap">{props.caption}</span> : null}
    </>
  )
  const cardClass = official ? 'squeek-card' : 'squeek-card unofficial'
  if (props.onToggle) return <button ref={near.ref as React.Ref<HTMLButtonElement>} type="button" className={cardClass} aria-pressed={!!props.selected} disabled={props.disabled} onClick={props.onToggle}>{body}</button>
  return <div ref={near.ref as React.Ref<HTMLDivElement>} className={cardClass}>{body}</div>
}

export function TxStatus({ state, chainId }: { state: TxState; chainId: number }) {
  if (state.phase === 'idle') return null
  const link = state.hash ? txUrl(chainId, state.hash) : null
  return <p className={`tx ${state.phase}`} role="status">{state.message} {link ? <a href={link} target="_blank" rel="noreferrer">View transaction</a> : null}</p>
}

export function NotDeployed({ chainId }: { chainId: number }) {
  return (
    <div className="stack">
      <section className="intro launch-pending">
        <span className="eyebrow">WRONG NETWORK · {networkName(chainId).toUpperCase()}</span>
        <h1>SqueekSwap runs on Sepolia.</h1>
        <p>SqueekSwap V2 is deployed on Ethereum Sepolia (11155111), the testnet Squeekchain uses. Switch your wallet to Sepolia to swap official Squeek Genesis NFTs.</p>
      </section>
    </div>
  )
}

function assetLabel(asset: Asset, official: string): string {
  return isOfficial(asset, official as Asset['collection'])
    ? `Genesis #${asset.tokenId}`
    : `UNOFFICIAL ${shortAddress(asset.collection)} #${asset.tokenId}`
}

/** How each offer state reads to a person (the contract's "closed" is a cancel, "revoked" a withdraw-all). */
export const STATUS_LABEL: Record<OfferStatus, string> = { open: 'Open', filled: 'Swapped', closed: 'Cancelled', expired: 'Expired', revoked: 'Withdrawn' }

/** Small artwork squares for one side of an offer. Unofficial NFTs never load art (see NftCard). */
function Thumbs({ items, official, levels }: { items: readonly Asset[]; official: Asset['collection']; levels: Record<string, number> }) {
  const shown = items.slice(0, 3)
  return (
    <span className="thumbs">
      {shown.map((asset) => isOfficial(asset, official)
        ? <span key={assetKey(asset)} className="thumb"><Art src={genesisImagePath(asset.tokenId, levels[assetKey(asset)] ?? null)} alt="" label={`Squeek #${asset.tokenId}`} /></span>
        : <span key={assetKey(asset)} className="thumb bad" title={asset.collection}>?</span>)}
      {items.length > shown.length ? <span className="thumb more">+{items.length - shown.length}</span> : null}
    </span>
  )
}

/** One offer in a list: both sides' artwork, who is trading, and when. The whole row opens the offer. */
export function OfferRow({ record, chainId, tag }: { record: OfferRecord; chainId: number; tag?: string }) {
  const { offer } = record
  const { address: viewer } = useConnection()
  const official = officialFor(chainId)
  const unofficial = unofficialAssets(offer, official).length > 0
  const ids = (items: readonly Asset[]) => items.map((asset) => assetLabel(asset, official)).join(', ')
  const now = Math.floor(Date.now() / 1000)
  const swapped = record.status === 'filled'
  const parties = swapped && record.filledBy
    ? `${who(offer.maker, viewer)} ⇄ ${who(record.filledBy, viewer)}`
    : `By ${who(offer.maker, viewer)}, ${offer.taker === zeroAddress ? 'open to anyone' : `for ${who(offer.taker, viewer)}`}`
  const when = swapped
    ? record.filledAt ? timeAgo(record.filledAt, now) : 'Swapped'
    : record.status === 'open' ? timeLeft(Number(offer.expiry), now) : null
  return (
    <Link className={unofficial ? 'trade-row unofficial' : 'trade-row'} href={`/offer/${chainId}/${record.id}`}>
      <span className="trade-pair">
        <Thumbs items={offer.give} official={official} levels={record.levels} />
        <span className="trade-arrow" aria-hidden="true">⇄</span>
        <Thumbs items={offer.want} official={official} levels={record.levels} />
      </span>
      <span className="trade-main">
        <span className="what">{ids(offer.give)} for {ids(offer.want)}{unofficial ? <span className="tag bad">NOT OFFICIAL GENESIS</span> : null}{tag && !unofficial ? <span className="tag">{tag}</span> : null}</span>
        <span className="meta">Offer {record.id.toString()} · {parties}</span>
      </span>
      <span className="trade-when">{when}</span>
      <span className={`status ${record.status}`}>{STATUS_LABEL[record.status]}</span>
    </Link>
  )
}

/** A contract address that links to its explorer page, with a copy button. */
export function CopyAddress({ address, href }: { address: string; href: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }
  return (
    <span className="copy-address">
      <a className="mono" href={href} target="_blank" rel="noreferrer" title="View on Sepolia Etherscan">{address}</a>
      <button type="button" className="text-button" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
    </span>
  )
}
