'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useState } from 'react'
import { zeroAddress } from 'viem'
import { useConfig, useConnection, useSwitchChain } from 'wagmi'
import { NftCard, STATUS_LABEL, TxStatus } from '@/components/Bits'
import { approveNft, cancelOffer, fillOffer, reclaimOffer } from '@/lib/actions'
import { deploymentFor } from '@/lib/deployments'
import { addressUrl, chainMismatch, networkName, parseOfferParams, same, shortAddress, sideLabels, timeLeft, tradeTitle, who } from '@/lib/format'
import { useApprovals, useCheck, useGenesisInfos, useOffer, useTx } from '@/lib/hooks'
import { assetKey, isOfficial, reasonText, unofficialAssets, type Asset } from '@/lib/offers'
import { asChainId } from '@/lib/wagmi'

/** A wallet or contract shown short ("You" for the viewer), linked to the explorer, with the full address on hover and copy. */
function AddressLine({ chainId, address, viewer }: { chainId: number; address: string; viewer?: string }) {
  const [copied, setCopied] = useState(false)
  const url = addressUrl(chainId, address)
  const label = same(address, viewer) ? `You (${shortAddress(address)})` : shortAddress(address)
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
    <span className="address-line">
      {url ? <a className="mono" href={url} target="_blank" rel="noreferrer" aria-label={address}>{label}</a> : <span className="mono">{label}</span>}
      <button type="button" className="text-button" onClick={copy} aria-label={`Copy ${address}`}>{copied ? 'Copied' : 'Copy'}</button>
    </span>
  )
}

function NotFound() { return <div className="panel"><h2>Offer not found</h2><p className="note">Check the link and offer number.</p><Link className="btn ghost" href="/offers">See open offers</Link></div> }

const when = (unixSeconds: number) => new Date(unixSeconds * 1000).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })

export default function OfferPage() {
  const params = useParams<{ chainId: string; id: string }>()
  const parsed = parseOfferParams(params.chainId ?? '', params.id ?? '')
  const chainId = parsed?.chainId ?? 0
  const offerId = parsed?.id ?? 0n
  const deployment = deploymentFor(chainId)
  const chain = asChainId(chainId)
  const config = useConfig()
  const { address, chainId: walletChainId, status } = useConnection()
  const switchChain = useSwitchChain()
  const record = useOffer(chainId, parsed && deployment ? offerId : null)
  const offer = record.data?.offer
  const official = deployment?.squeeks
  const assets = offer ? [...offer.give, ...offer.want] : []
  // Official Genesis cards load in one batched request; other contracts are never looked up (see NftCard).
  const genesis = useGenesisInfos(chainId, official ? assets.filter((asset) => isOfficial(asset, official)).map((asset) => asset.tokenId) : [])
  const isMaker = same(offer?.maker, address)
  const unofficial = offer && official ? unofficialAssets(offer, official) : []
  const blocked = unofficial.length > 0
  const check = useCheck(chainId, offerId, offer, address && !isMaker && !blocked ? address : undefined)
  const approvals = useApprovals(chainId, address, isMaker || blocked ? [] : [...(offer?.want ?? [])])
  const tx = useTx()
  const [copied, setCopied] = useState(false)

  if (!parsed || !deployment || !chain) return <NotFound />
  if (record.isLoading) return <p className="note">Loading offer…</p>
  if (record.error) return <p className="error">{(record.error as Error).message}</p>
  if (!record.data || !offer) return <NotFound />

  const offerStatus = record.data.status
  const levelsAtOffer = record.data.levels
  const filledBy = record.data.filledBy
  const filledAt = record.data.filledAt
  const wrongNetwork = status === 'connected' && chainMismatch(walletChainId, chainId)
  const reason = check.data
  const unapproved = approvals.data ? offer.want.filter((asset) => !approvals.data[assetKey(asset)]) : []
  const labels = sideLabels(address, offer.maker, offer.taker)
  const expiry = Number(offer.expiry)
  const live = offerStatus === 'open' || offerStatus === 'revoked' || offerStatus === 'expired'
  const acting = status === 'connected' && !wrongNetwork
  const info = (asset: Asset) => isOfficial(asset, deployment.squeeks) ? genesis.data?.find((item) => item.tokenId === asset.tokenId) : undefined
  const levelChange = (asset: Asset) => {
    const before = levelsAtOffer[assetKey(asset)]
    const now = info(asset)?.level
    return before !== undefined && now !== undefined && now !== null && now !== before ? { before, now } : null
  }
  const changed = assets.filter((asset) => levelChange(asset))
  const cards = (items: readonly Asset[], expectedOwner: string | null) => items.map((asset) => {
    if (!isOfficial(asset, deployment.squeeks)) return <NftCard key={assetKey(asset)} chainId={chainId} asset={asset} caption="Not part of official Squeek Genesis." />
    const nft = info(asset)
    const moved = nft?.owner && expectedOwner && !same(nft.owner, expectedOwner) ? `Now held by ${who(nft.owner, address)}.` : undefined
    const level = levelChange(asset)
    const leveled = level ? `Level was ${level.before} when offered, now ${level.now}.` : undefined
    const caption = moved || leveled || (nft ? (nft.owner ? (nft.custody === 'staking' ? 'Staked' : `Held by ${who(nft.owner, address)}`) : 'Burned or not issued') : 'Loading current state…')
    return <NftCard key={assetKey(asset)} chainId={chainId} asset={asset} info={nft} caption={caption} />
  })

  const anyone = offer.taker === zeroAddress
  const now = Math.floor(Date.now() / 1000)
  const stateLine = offerStatus === 'open'
    ? `${timeLeft(expiry, now)} · expires ${when(expiry)}`
    : offerStatus === 'filled'
      ? `${filledAt ? `${when(filledAt)} · ` : ''}${who(offer.maker, address)} and ${filledBy ? who(filledBy, address) : 'the taker'} traded`
      : offerStatus === 'expired'
        ? `Expired ${when(expiry)}`
        : offerStatus === 'revoked' ? 'The maker withdrew all their older offers, including this one.' : 'The maker cancelled this offer. Nothing was swapped.'

  async function copyLink() { try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { setCopied(false) } }

  return (
    <div className="stack tight">
      <section className="offer-head">
        <div className="offer-title">
          <span className="eyebrow">OFFER {offerId.toString()} · {networkName(chainId).toUpperCase()}</span>
          <h1 className="page-title">{tradeTitle(offer.give, offer.want)}</h1>
          <p className="offer-state"><span className={`status-chip ${offerStatus}`}>{STATUS_LABEL[offerStatus]}</span><span>{stateLine}</span></p>
        </div>
        <button type="button" className="btn ghost" onClick={copyLink}>{copied ? 'Link copied' : 'Copy offer link'}</button>
      </section>

      {blocked ? <section className="panel danger"><h2>Not official Squeek Genesis</h2><p>{unofficial.length === 1 ? 'One NFT' : `${unofficial.length} NFTs`} in this offer come from a contract other than the official Squeek Genesis collection. Its name and pictures can imitate Genesis. This website will not help accept it.</p><ul className="note mono">{unofficial.map((asset) => <li key={assetKey(asset)}>{asset.collection} #{asset.tokenId.toString()}</li>)}</ul></section> : null}
      {changed.length > 0 && live ? <section className="panel danger"><h2>Levels changed since this offer</h2><p>{changed.map((asset) => { const level = levelChange(asset)!; return `#${asset.tokenId}: level ${level.before} → ${level.now}` }).join(' · ')}. The swap moves the NFTs as they are now. Review before accepting.</p></section> : null}

      <section className={`ticket ${offerStatus}`}>
        <div className="sides">
          <div className="side"><span className="lab">{labels.give}</span><div className="grid">{cards(offer.give, offer.maker)}</div></div>
          <span className="swap" aria-hidden="true">⇄</span>
          <div className="side"><span className="lab">{labels.want}</span><div className="grid">{cards(offer.want, anyone ? null : offer.taker)}</div></div>
        </div>
        <div className="ticket-actions">
          {offerStatus === 'filled' ? <p className="ok">Swap complete. Both sides moved in one transaction.</p> : null}
          {offerStatus === 'expired' ? <p className="note">This offer expired. Anyone can close its onchain record.</p> : null}
          {(offerStatus === 'closed' || offerStatus === 'revoked') ? <p className="note">Nothing was swapped. The NFTs never left either wallet.</p> : null}
          {live && status !== 'connected' ? <p className="note">Connect a wallet to accept or cancel this offer.</p> : null}
          {live && wrongNetwork ? <div className="row-actions"><p className="error">Your wallet is on another network.</p><button type="button" className="btn" onClick={() => switchChain.mutate({ chainId: chain })}>Switch to Sepolia</button></div> : null}
          {(offerStatus === 'open' || offerStatus === 'revoked') && acting && isMaker ? <>
            {offerStatus === 'open' ? <p className="note">Waiting for {anyone ? 'any holder of the Squeeks you want' : who(offer.taker, address)} to accept. Your Squeeks stay in your wallet until then.</p> : null}
            <div className="row-actions"><button type="button" className="btn ghost" disabled={tx.busy} onClick={() => tx.run('Cancel offer', () => cancelOffer(config, chain, deployment, offerId))}>Cancel offer</button></div>
          </> : null}
          {offerStatus === 'open' && acting && !isMaker && blocked ? <p className="error">Accepting is disabled for offers outside official Squeek Genesis.</p> : null}
          {offerStatus === 'open' && acting && !isMaker && !blocked ? <>
            {reason !== undefined ? <p className={reason === 0 ? 'ok' : 'note'}>{reasonText(reason)}</p> : null}
            <div className="row-actions">
              {unapproved.map((asset) => <button key={assetKey(asset)} type="button" className="btn ghost" disabled={tx.busy} onClick={() => tx.run(`Approve #${asset.tokenId}`, () => approveNft(config, chain, deployment, asset), 'approval')}>Approve Genesis #{asset.tokenId.toString()}</button>)}
              <button type="button" className="btn" disabled={reason !== 0 || tx.busy} onClick={() => tx.run('Accept swap', () => fillOffer(config, chain, deployment, offerId, offer), 'swap')}>Accept swap</button>
            </div>
          </> : null}
          {offerStatus === 'expired' && acting ? <button type="button" className="btn ghost" disabled={tx.busy} onClick={() => tx.run('Close expired offer', () => reclaimOffer(config, chain, deployment, offerId))}>Close expired offer</button> : null}
          <TxStatus state={tx.state} chainId={chainId} />
        </div>
      </section>

      <section className="details">
        <h2 className="details-title">Offer details</h2>
        <dl className="facts">
          <dt>Made by</dt><dd><AddressLine chainId={chainId} address={offer.maker} viewer={address} /></dd>
          <dt>Can accept</dt><dd>{anyone ? 'Any wallet holding every wanted Squeek' : <AddressLine chainId={chainId} address={offer.taker} viewer={address} />}</dd>
          {filledBy ? <><dt>Accepted by</dt><dd><AddressLine chainId={chainId} address={filledBy} viewer={address} /></dd></> : null}
          <dt>Collection</dt><dd>{blocked ? <span className="error">Includes NFTs outside official Squeek Genesis</span> : <>Official Squeek Genesis <AddressLine chainId={chainId} address={deployment.squeeks} /></>}</dd>
          <dt>Fee</dt><dd>0 ETH. You pay only network gas.</dd>
          <dt>Network</dt><dd>{networkName(chainId)} testnet. Only NFTs admitted to the onchain registry can move.</dd>
        </dl>
        <p className="note">Check the collection and wallet addresses in your wallet before you sign anything.</p>
      </section>
    </div>
  )
}
