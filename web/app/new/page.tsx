'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { isAddress, type Address } from 'viem'
import { useConfig, useConnection, useSwitchChain } from 'wagmi'
import { getBlock } from 'wagmi/actions'
import { CopyAddress, NotDeployed, PAGE_SIZE, ShowMore, SqueekCard, TxStatus } from '@/components/Bits'
import { GenesisBrowser } from '@/components/GenesisBrowser'
import { ConnectButton } from '@/components/Header'
import { approveNft, cancelOffer, createOffer } from '@/lib/actions'
import { offerIdFromLogs } from '@/lib/chain'
import { chainMismatch, shortAddress } from '@/lib/format'
import { useActiveSwap, useApprovals, useGenesisInfos, useHoldings, useOffers, useSwapAccount, useTx } from '@/lib/hooks'
import { assetKey, buildOffer, EXPIRY_DAYS, MAX_ITEMS, sameAsset, splitOffers, validateDraft, type Asset, type Draft, type ExpiryDays } from '@/lib/offers'
import { asChainId } from '@/lib/wagmi'

const toggle = (list: Asset[], asset: Asset) => list.some((item) => sameAsset(item, asset)) ? list.filter((item) => !sameAsset(item, asset)) : list.length >= MAX_ITEMS ? list : [...list, asset]

export default function NewOffer() {
  const router = useRouter()
  const config = useConfig()
  const { address, chainId: walletChainId, status } = useConnection()
  const switchChain = useSwitchChain()
  const { chainId, deployment } = useActiveSwap()
  const [give, setGive] = useState<Asset[]>([])
  const [want, setWant] = useState<Asset[]>([])
  const [browse, setBrowse] = useState('')
  const [privateTaker, setPrivateTaker] = useState(true)
  const [expiryDays, setExpiryDays] = useState<ExpiryDays>(7)
  const browseAddress = isAddress(browse) ? (browse as Address) : undefined
  const mine = useHoldings(chainId, address)
  const theirs = useHoldings(chainId, browseAddress)
  const [mineShown, setMineShown] = useState(PAGE_SIZE)
  const [theirsShown, setTheirsShown] = useState(PAGE_SIZE)
  const walletMine = mine.data?.filter((holding) => holding.custody === 'wallet') ?? []
  const walletTheirs = theirs.data?.filter((holding) => holding.custody === 'wallet') ?? []
  // Only the selected NFTs are re-read onchain (owner, custody, level) to build the offer. Grid cards come
  // straight from the holdings list, which already carries level and custody, so browsing costs no extra reads.
  const infos = useGenesisInfos(chainId, [...give, ...want].map((asset) => asset.tokenId))
  const approvals = useApprovals(chainId, address, give)
  const account = useSwapAccount(chainId, address)
  const offers = useOffers(chainId, !!address && give.length > 0)
  const tx = useTx()
  const chain = asChainId(chainId)

  if (!deployment || !chain) return <NotDeployed chainId={chainId} />
  const wrongNetwork = status === 'connected' && chainMismatch(walletChainId, chainId)

  const squeekAsset = (tokenId: bigint): Asset => ({ collection: deployment.squeeks, tokenId })
  const info = (asset: Asset) => infos.data?.find((item) => item.tokenId === asset.tokenId)
  const ready = [...give, ...want].every((asset) => !!info(asset))
  const draft: Draft | null = ready && account.data && address ? {
    maker: address,
    give: give.map((asset) => ({ ...asset, owner: info(asset)?.owner ?? null, custody: info(asset)?.custody ?? 'unknown' })),
    want: want.map((asset) => ({ ...asset, owner: info(asset)?.owner ?? null, custody: info(asset)?.custody ?? 'unknown' })),
    privateTaker,
    expiryDays,
    nowSeconds: BigInt(Math.floor(Date.now() / 1000)),
    nonce: account.data.nonce,
  } : null
  const problem = draft ? validateDraft(draft) : null
  const counterparty = want.length > 0 ? info(want[0])?.owner ?? null : null
  const unapproved = approvals.data ? give.filter((asset) => !approvals.data[assetKey(asset)]) : give
  const overlapping = splitOffers(offers.data?.records ?? [], address).mine.filter((record) => record.status === 'open' && record.offer.give.some((offered) => give.some((asset) => sameAsset(offered, asset))))

  async function create() {
    if (!draft || problem) return
    const activeChain = chain!
    const activeDeployment = deployment!
    const receipt = await tx.run('Create offer', async () => {
      const latest = await getBlock(config, { chainId: activeChain })
      return createOffer(config, activeChain, activeDeployment, buildOffer({ ...draft, nowSeconds: latest.timestamp }))
    })
    const id = receipt ? offerIdFromLogs(receipt.logs) : null
    if (id !== null) router.push(`/offer/${chainId}/${id}`)
  }

  const selectedCard = (asset: Asset, remove: () => void) => {
    const nft = info(asset)
    const caption = nft ? (nft.owner ? (nft.custody === 'staking' ? 'Staked' : 'Wallet custody') : 'Token not found') : 'Checking onchain…'
    return <SqueekCard key={assetKey(asset)} chainId={chainId} id={asset.tokenId} level={nft?.level} custody={nft?.custody} caption={caption} selected onToggle={remove} />
  }

  return (
    <div className="stack">
      <section className="intro offer-intro"><h1>Make an offer.</h1><p>Pick the Genesis Squeeks you want and the ones you give. When the other holder accepts, both sides move in one transaction.</p></section>

      <section className="official-collection" aria-label="Official Squeek Genesis collection">
        <div><span className="lab">VERIFIED COLLECTION</span><h2>Squeek Genesis</h2></div>
        <CopyAddress address={deployment.squeeks} href={`https://sepolia.etherscan.io/address/${deployment.squeeks}`} />
        <p>Only this collection can be traded here. Other Squeekchain collections will be added after review.</p>
      </section>

      <section className="section">
        <div className="section-head"><div><span className="step">CHOOSE GENESIS NFTS</span><h2>You want</h2></div><span className="count">{want.length}/{MAX_ITEMS}</span></div>
        <GenesisBrowser chainId={chainId} selected={want.filter((asset) => asset.collection.toLowerCase() === deployment.squeeks.toLowerCase()).map((asset) => asset.tokenId)} onToggle={(id) => setWant((list) => toggle(list, squeekAsset(id)))} />
        <div className="holder-browser">
          <label className="field" htmlFor="browse"><span className="lab">BROWSE A GENESIS HOLDER</span><input id="browse" placeholder="Paste a 0x wallet address" value={browse} onChange={(event) => { setBrowse(event.target.value.trim()); setTheirsShown(PAGE_SIZE) }} /></label>
          {browse && !browseAddress ? <p className="error">That is not a wallet address.</p> : null}
          {theirs.isLoading ? <p className="note">Loading that holder's Genesis NFTs...</p> : null}
          <div className="grid">{walletTheirs.slice(0, theirsShown).map((holding) => { const asset = squeekAsset(holding.id); const selected = want.some((item) => sameAsset(item, asset)); return <SqueekCard key={holding.id.toString()} chainId={chainId} id={holding.id} level={holding.level} custody={holding.custody} selected={selected} disabled={want.length >= MAX_ITEMS && !selected} onToggle={() => setWant((list) => toggle(list, asset))} /> })}</div>
          <ShowMore shown={Math.min(theirsShown, walletTheirs.length)} total={walletTheirs.length} complete={theirs.complete} onMore={() => setTheirsShown((n) => n + PAGE_SIZE)} />
        </div>
      </section>

      <section className="section">
        <div className="section-head"><div><span className="step">YOUR GENESIS NFTS</span><h2>You give</h2></div><span className="count">{give.length}/{MAX_ITEMS}</span></div>
        {!address ? <div className="connect-gate"><div><h3>Connect wallet</h3><p>Connect to prove ownership and approve only the exact NFTs you select.</p></div><ConnectButton /></div> : <>
          <p className="note">Wallet-held Squeek Genesis NFTs appear below automatically.</p>
          {mine.isLoading ? <p className="note">Loading your Genesis NFTs...</p> : null}
          <div className="grid">{walletMine.slice(0, mineShown).map((holding) => { const asset = squeekAsset(holding.id); const selected = give.some((item) => sameAsset(item, asset)); return <SqueekCard key={holding.id.toString()} chainId={chainId} id={holding.id} level={holding.level} custody={holding.custody} selected={selected} disabled={give.length >= MAX_ITEMS && !selected} onToggle={() => setGive((list) => toggle(list, asset))} /> })}</div>
          <ShowMore shown={Math.min(mineShown, walletMine.length)} total={walletMine.length} complete={mine.complete} onMore={() => setMineShown((n) => n + PAGE_SIZE)} />
        </>}
      </section>

      <section className="section">
        <div className="section-head"><div><span className="step">CONFIRM THE TRADE</span><h2>Review</h2></div><span className="status open">DRAFT</span></div>
        <div className="sides"><div className="side"><span className="lab">YOU GIVE {give.length}</span><div className="grid">{give.map((asset) => selectedCard(asset, () => setGive((list) => toggle(list, asset))))}</div></div><span className="swap" aria-hidden="true">⇄</span><div className="side"><span className="lab">YOU GET {want.length}{counterparty ? ` FROM ${shortAddress(counterparty)}` : ''}</span><div className="grid">{want.map((asset) => selectedCard(asset, () => setWant((list) => toggle(list, asset))))}</div></div></div>
        {!address ? <div className="panel review-locked"><h3>Your draft is local.</h3><p className="note">Connect above when you are ready to complete both sides.</p></div> : <div className="panel">
          <label className="checkline"><input type="checkbox" checked={privateTaker} onChange={(event) => setPrivateTaker(event.target.checked)} />{counterparty ? `Only ${shortAddress(counterparty)} can accept` : 'Restrict acceptance to the current owner of the wanted NFTs'}</label>
          <label className="field"><span className="lab">Expires after</span><select value={expiryDays} onChange={(event) => setExpiryDays(Number(event.target.value) as ExpiryDays)}>{EXPIRY_DAYS.map((days) => <option key={days} value={days}>{days} {days === 1 ? 'day' : 'days'}</option>)}</select></label>
          {wrongNetwork ? <div className="row-actions"><p className="error">Your wallet is on another network. SqueekSwap runs on Sepolia.</p><button type="button" className="btn" onClick={() => switchChain.mutate({ chainId: chain })}>Switch to Sepolia</button></div> : null}
          <p className="note">Platform fee: 0 ETH. Each approval is limited to one NFT.</p>
          {problem && (give.length > 0 || want.length > 0) ? <p className="error">{problem}</p> : null}
          {overlapping.length > 0 ? <div className="panel danger"><h3>Approval overlap</h3><p>One of these NFTs also appears in an older open offer. Cancel the old offer if you no longer intend it.</p><div className="row-actions">{overlapping.map((record) => <button key={record.id.toString()} type="button" className="btn ghost" disabled={tx.busy} onClick={() => tx.run(`Cancel offer ${record.id}`, () => cancelOffer(config, chain, deployment, record.id))}>Cancel offer {record.id.toString()}</button>)}</div></div> : null}
          {!ready && give.length + want.length > 0 ? <p className="note">Verifying collections, ownership and custody onchain…</p> : null}
          <div className="row-actions">{unapproved.map((asset) => <button key={assetKey(asset)} type="button" className="btn ghost" disabled={tx.busy} onClick={() => tx.run(`Approve #${asset.tokenId}`, () => approveNft(config, chain, deployment, asset), 'approval')}>Approve Genesis #{asset.tokenId.toString()}</button>)}<button type="button" className="btn" disabled={!draft || !!problem || unapproved.length > 0 || tx.busy || wrongNetwork} onClick={create}>Create offer <span aria-hidden="true">↗</span></button></div>
          <TxStatus state={tx.state} chainId={chainId} />
        </div>}
      </section>
    </div>
  )
}
