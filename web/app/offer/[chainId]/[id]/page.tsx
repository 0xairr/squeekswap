'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useState } from 'react'
import { zeroAddress } from 'viem'
import { useConfig, useConnection, useSwitchChain } from 'wagmi'
import { NftCard, TxStatus } from '@/components/Bits'
import { approveNft, cancelOffer, fillOffer, reclaimOffer } from '@/lib/actions'
import { deploymentFor } from '@/lib/deployments'
import { addressUrl, chainMismatch, networkName, parseOfferParams, same, shortAddress, sideLabels } from '@/lib/format'
import { useApprovals, useCheck, useGenesisInfos, useOffer, useTx } from '@/lib/hooks'
import { assetKey, isOfficial, reasonText, unofficialAssets, type Asset } from '@/lib/offers'
import { asChainId } from '@/lib/wagmi'

function FullAddress({ chainId, address }: { chainId: number; address: string }) {
  const url = addressUrl(chainId, address)
  return url ? <a className="mono" href={url} target="_blank" rel="noreferrer">{address}</a> : <span className="mono">{address}</span>
}

function NotFound() { return <div className="panel"><h2>Offer not found</h2><p className="note">Check the link and offer number.</p><Link className="btn ghost" href="/offers">See open offers</Link></div> }

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
  const wrongNetwork = status === 'connected' && chainMismatch(walletChainId, chainId)
  const reason = check.data
  const unapproved = approvals.data ? offer.want.filter((asset) => !approvals.data[assetKey(asset)]) : []
  const labels = sideLabels(address, offer.maker, offer.taker)
  const expires = new Date(Number(offer.expiry) * 1000).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
  const live = offerStatus === 'open' || offerStatus === 'revoked' || offerStatus === 'expired'
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
    const moved = nft?.owner && expectedOwner && !same(nft.owner, expectedOwner) ? `Now held by ${shortAddress(nft.owner)}.` : undefined
    const level = levelChange(asset)
    const leveled = level ? `Level was ${level.before} when offered, now ${level.now}.` : undefined
    const caption = moved || leveled || (nft ? (nft.owner ? `${nft.custody === 'staking' ? 'Staked custody' : 'Wallet custody'}` : 'Burned or not issued') : 'Loading current state…')
    return <NftCard key={assetKey(asset)} chainId={chainId} asset={asset} info={nft} caption={caption} />
  })

  async function copyLink() { try { await navigator.clipboard.writeText(window.location.href); setCopied(true) } catch { setCopied(false) } }
  const cancelButton = <div className="row-actions"><button type="button" className="btn ghost" disabled={tx.busy} onClick={() => tx.run('Cancel offer', () => cancelOffer(config, chain, deployment, offerId))}>Cancel offer</button><span className="note">The NFTs never left either wallet.</span></div>

  return (
    <div className="stack">
      <section className="intro"><span className="eyebrow">OFFER {offerId.toString()} · {networkName(chainId)}</span><h1>{offer.give.length} <span className="orange">⇄</span> {offer.want.length}</h1><p><span className={`status ${offerStatus}`}>{offerStatus}</span> · expires {expires}</p><dl className="facts"><dt className="lab">Made by</dt><dd><FullAddress chainId={chainId} address={offer.maker} /></dd><dt className="lab">Can accept</dt><dd>{offer.taker === zeroAddress ? 'Any wallet holding every requested NFT' : <FullAddress chainId={chainId} address={offer.taker} />}</dd><dt className="lab">Collection</dt><dd>{blocked ? <span className="error">Includes NFTs outside official Squeek Genesis</span> : <>Official Squeek Genesis · <FullAddress chainId={chainId} address={deployment.squeeks} /></>}</dd><dt className="lab">Platform fee</dt><dd>0 ETH</dd></dl><p className="note">Verify collection and wallet addresses before signing.</p><button type="button" className="btn ghost" onClick={copyLink}>{copied ? 'Link copied' : 'Copy offer link'}</button></section>
      <p className="testnet">SEPOLIA TESTNET · This offer can move only NFTs deployed on Sepolia and admitted to the onchain registry.</p>
      {blocked ? <section className="panel danger"><h2>Not official Squeek Genesis</h2><p>{unofficial.length === 1 ? 'One NFT' : `${unofficial.length} NFTs`} in this offer come from a contract other than the official Squeek Genesis collection. Its name and pictures can imitate Genesis. This website will not help accept it.</p><ul className="note mono">{unofficial.map((asset) => <li key={assetKey(asset)}>{asset.collection} #{asset.tokenId.toString()}</li>)}</ul></section> : null}
      {changed.length > 0 && live ? <section className="panel danger"><h2>Levels changed since this offer</h2><p>{changed.map((asset) => { const level = levelChange(asset)!; return `#${asset.tokenId}: level ${level.before} → ${level.now}` }).join(' · ')}. The swap moves the NFTs as they are now. Review before accepting.</p></section> : null}
      <section className="sides"><div className="side"><span className="lab">{labels.give}</span><div className="grid">{cards(offer.give, offer.maker)}</div></div><span className="swap" aria-hidden="true">⇄</span><div className="side"><span className="lab">{labels.want}</span><div className="grid">{cards(offer.want, offer.taker === zeroAddress ? null : offer.taker)}</div></div></section>
      <section className="panel">
        {offerStatus === 'filled' ? <p className="ok">Swap completed{record.data.filledBy ? ` with ${shortAddress(record.data.filledBy)}` : ''}.</p> : null}
        {offerStatus === 'closed' ? <p className="note">This offer was cancelled or reclaimed. Nothing was swapped.</p> : null}
        {offerStatus === 'expired' ? <p className="note">This offer expired. Anyone can close its onchain record.</p> : null}
        {offerStatus === 'revoked' ? <p className="note">The maker invalidated all their older offers, including this one.</p> : null}
        {live && status !== 'connected' ? <p className="note">Connect a wallet to act on this offer.</p> : null}
        {live && wrongNetwork ? <div className="row-actions"><p className="error">Your wallet is on another network.</p><button type="button" className="btn" onClick={() => switchChain.mutate({ chainId: chain })}>Switch to Sepolia</button></div> : null}
        {(offerStatus === 'open' || offerStatus === 'revoked') && status === 'connected' && !wrongNetwork && isMaker ? cancelButton : null}
        {offerStatus === 'open' && status === 'connected' && !wrongNetwork && !isMaker && blocked ? <p className="error">Accepting is disabled for offers outside official Squeek Genesis.</p> : null}
        {offerStatus === 'open' && status === 'connected' && !wrongNetwork && !isMaker && !blocked ? <>{reason !== undefined ? <p className={reason === 0 ? 'ok' : 'note'}>{reasonText(reason)}</p> : null}<div className="row-actions">{unapproved.map((asset) => <button key={assetKey(asset)} type="button" className="btn ghost" disabled={tx.busy} onClick={() => tx.run(`Approve #${asset.tokenId}`, () => approveNft(config, chain, deployment, asset), 'approval')}>Approve Genesis #{asset.tokenId.toString()}</button>)}<button type="button" className="btn" disabled={reason !== 0 || tx.busy} onClick={() => tx.run('Accept swap', () => fillOffer(config, chain, deployment, offerId, offer), 'swap')}>Accept swap <span aria-hidden="true">↗</span></button></div></> : null}
        {offerStatus === 'expired' && status === 'connected' && !wrongNetwork ? <button type="button" className="btn ghost" disabled={tx.busy} onClick={() => tx.run('Close expired offer', () => reclaimOffer(config, chain, deployment, offerId))}>Close expired offer</button> : null}
        <TxStatus state={tx.state} chainId={chainId} />
      </section>
    </div>
  )
}
