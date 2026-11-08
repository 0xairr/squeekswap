'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { isAddress, type Address } from 'viem'
import { useConfig, useConnection, useSwitchChain } from 'wagmi'
import { getBlock } from 'wagmi/actions'
import { CopyAddress, NotDeployed, PAGE_SIZE, ShowMore, SqueekCard, TxStatus } from '@/components/Bits'
import { GenesisBrowser } from '@/components/GenesisBrowser'
import { ConnectButton } from '@/components/Header'
import { approveNft, cancelOffer, createOffer, revokeNft } from '@/lib/actions'
import { offerIdFromLogs } from '@/lib/chain'
import { chainMismatch, same, shortAddress } from '@/lib/format'
import { useActiveSwap, useApprovals, useGenesisInfos, useHoldings, useOffers, useSwapAccount, useTx } from '@/lib/hooks'
import { assetKey, buildOffer, draftKey, EXPIRY_DAYS, MAX_ITEMS, sameAsset, splitOffers, validateDraft, type Asset, type Draft, type ExpiryDays } from '@/lib/offers'
import { asChainId } from '@/lib/wagmi'

const toggle = (list: Asset[], asset: Asset) => list.some((item) => sameAsset(item, asset)) ? list.filter((item) => !sameAsset(item, asset)) : list.length >= MAX_ITEMS ? list : [...list, asset]

/** "2 selected of 8", highlighted once anything is picked, with a Clear button for the whole side. */
function SelectedCount({ count, onClear, locked }: { count: number; onClear: () => void; locked: boolean }) {
  return (
    <span className="count-group">
      <span className={count > 0 ? 'selected-count on' : 'selected-count'} aria-live="polite"><b>{count}</b> selected <small>of {MAX_ITEMS}</small></span>
      {count > 0 ? <button type="button" className="text-button" disabled={locked} onClick={onClear}>Clear</button> : null}
    </span>
  )
}

/** Empty and error states for a wallet's Genesis holdings, once loading has finished. */
function HoldingsState({ holdings, walletCount, who }: { holdings: { data?: unknown[]; complete: boolean; isLoading: boolean; error: unknown }; walletCount: number; who: string }) {
  if (holdings.isLoading) return null
  if (holdings.error) return <p className="error">Could not load Genesis NFTs for this wallet. Try again in a moment.</p>
  if (!holdings.data || !holdings.complete) return null
  if (holdings.data.length === 0) return <p className="empty-state">{who} holds no Squeek Genesis NFTs.</p>
  if (walletCount === 0) return <p className="empty-state">{who}’s Genesis NFTs are all staked. Withdraw one from staking before it can be swapped.</p>
  return null
}

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
  // Approvals sent from this page and the selection they were sent for, so a later edit is flagged.
  const [approvedHere, setApprovedHere] = useState<Asset[]>([])
  const [approvedFor, setApprovedFor] = useState<string | null>(null)
  // The wallet decides which account is connected and can switch it at any time. Picks to give belong to the
  // account that was connected, so a switch clears them and says why.
  const [switchedFrom, setSwitchedFrom] = useState<Address | null>(null)
  const lastAddress = useRef<Address | undefined>(undefined)
  useEffect(() => {
    if (!address) return
    const before = lastAddress.current
    lastAddress.current = address
    if (before && !same(before, address)) {
      setGive([])
      setApprovedHere([])
      setApprovedFor(null)
      setSwitchedFrom(before)
    }
  }, [address])
  const browseAddress = isAddress(browse) ? (browse as Address) : undefined
  const mine = useHoldings(chainId, address)
  const theirs = useHoldings(chainId, browseAddress)
  const [mineShown, setMineShown] = useState(PAGE_SIZE)
  const [theirsShown, setTheirsShown] = useState(PAGE_SIZE)
  const walletMine = mine.data?.filter((holding) => holding.custody === 'wallet') ?? []
  const walletTheirs = theirs.data?.filter((holding) => holding.custody === 'wallet') ?? []
  // Squeekchain's holdings list waits for 12 confirmations, so right after a swap it can still list a Squeek
  // that already moved. The cards on screen are re-read onchain and any that left the wallet are hidden.
  const shownMine = walletMine.slice(0, mineShown)
  const shownTheirs = walletTheirs.slice(0, theirsShown)
  const onchain = useGenesisInfos(chainId, [...shownMine, ...shownTheirs].map((holding) => holding.id))
  const leftWallet = (id: bigint, owner: Address | undefined) => {
    const row = onchain.data.find((item) => item.tokenId === id)
    return !!row && (row.custody !== 'wallet' || !same(row.owner, owner))
  }
  const visibleMine = shownMine.filter((holding) => !leftWallet(holding.id, address))
  const goneMine = shownMine.filter((holding) => leftWallet(holding.id, address))
  const visibleTheirs = shownTheirs.filter((holding) => !leftWallet(holding.id, browseAddress))
  const goneTheirs = shownTheirs.filter((holding) => leftWallet(holding.id, browseAddress))
  // Only the selected NFTs are re-read onchain (owner, custody, level) to build the offer. Grid cards come
  // straight from the holdings list, which already carries level and custody, so browsing costs no extra reads.
  const infos = useGenesisInfos(chainId, [...give, ...want].map((asset) => asset.tokenId))
  const approvals = useApprovals(chainId, address, give)
  const account = useSwapAccount(chainId, address)
  const offers = useOffers(chainId, !!address && (give.length > 0 || approvedHere.length > 0))
  const tx = useTx()
  // The offer just created here, while the page moves to it. Without this, the refreshed offer list shows the
  // new offer as an "Approval overlap" and Create offer re-enables for a moment before the page changes.
  const [created, setCreated] = useState<bigint | null>(null)
  const chain = asChainId(chainId)
  // While a wallet request is open, the selection it was made for must not change underneath it.
  const locked = tx.busy || created !== null
  const editGive = (asset: Asset) => { if (!locked) setGive((list) => toggle(list, asset)) }
  const editWant = (asset: Asset) => { if (!locked) setWant((list) => toggle(list, asset)) }

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
  const myOpen = splitOffers(offers.data?.records ?? [], address).mine.filter((record) => record.status === 'open')
  const overlapping = myOpen.filter((record) => record.id !== created && record.offer.give.some((offered) => give.some((asset) => sameAsset(offered, asset))))
  const currentKey = draftKey(give, want)
  const changedAfterApproval = approvedFor !== null && approvedFor !== currentKey
  const staleApprovals = approvedHere.filter((asset) => !give.some((item) => sameAsset(item, asset)))
  const usedBy = (asset: Asset) => myOpen.find((record) => record.offer.give.some((offered) => sameAsset(offered, asset)))

  async function approve(asset: Asset) {
    const receipt = await tx.run(`Approve #${asset.tokenId}`, () => approveNft(config, chain!, deployment!, asset), 'approval')
    if (!receipt) return
    setApprovedHere((list) => list.some((item) => sameAsset(item, asset)) ? list : [...list, asset])
    setApprovedFor(draftKey(give, want))
  }

  async function revoke(asset: Asset) {
    const receipt = await tx.run(`Revoke approval for #${asset.tokenId}`, () => revokeNft(config, chain!, asset), 'approval')
    if (receipt) setApprovedHere((list) => list.filter((item) => !sameAsset(item, asset)))
  }

  async function create() {
    if (!draft || problem) return
    const activeChain = chain!
    const activeDeployment = deployment!
    await tx.run('Create offer', async () => {
      const latest = await getBlock(config, { chainId: activeChain })
      return createOffer(config, activeChain, activeDeployment, buildOffer({ ...draft, nowSeconds: latest.timestamp }))
    }, 'offer', (receipt) => {
      const id = offerIdFromLogs(receipt.logs)
      if (id === null) return
      setCreated(id)
      router.push(`/offer/${chainId}/${id}`)
    })
  }

  const selectedCard = (asset: Asset, remove: () => void) => {
    const nft = info(asset)
    const caption = nft ? (nft.owner ? (nft.custody === 'staking' ? 'Staked' : nft.custody === 'unclaimed' ? 'Unclaimed' : 'Wallet custody') : 'Token not found') : 'Checking onchain…'
    return (
      <div key={assetKey(asset)} className="picked">
        <SqueekCard chainId={chainId} id={asset.tokenId} level={nft?.level} custody={nft?.custody} caption={caption} />
        <button type="button" className="btn ghost picked-remove" disabled={locked} onClick={remove} aria-label={`Remove Squeek #${asset.tokenId} from the offer`}>✕ Remove</button>
      </div>
    )
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
        <div className="section-head"><div><span className="step">CHOOSE GENESIS NFTS</span><h2>You want</h2></div><SelectedCount count={want.length} locked={locked} onClear={() => setWant([])} /></div>
        <GenesisBrowser chainId={chainId} selected={want.filter((asset) => asset.collection.toLowerCase() === deployment.squeeks.toLowerCase()).map((asset) => asset.tokenId)} locked={locked} onToggle={(id) => editWant(squeekAsset(id))} />
        <div className="holder-browser">
          <label className="field" htmlFor="browse"><span className="lab">BROWSE A GENESIS HOLDER</span><input id="browse" placeholder="Paste a 0x wallet address" value={browse} onChange={(event) => { setBrowse(event.target.value.trim()); setTheirsShown(PAGE_SIZE) }} /></label>
          {browse && !browseAddress ? <p className="error">That is not a wallet address.</p> : null}
          {theirs.isLoading ? <p className="note">Loading that holder's Genesis NFTs...</p> : null}
          {browseAddress ? <HoldingsState holdings={theirs} walletCount={walletTheirs.length} who="This wallet" /> : null}
          {goneTheirs.length > 0 ? <p className="note">{goneTheirs.map((holding) => `#${holding.id}`).join(', ')} already left this wallet onchain, so {goneTheirs.length === 1 ? 'it is' : 'they are'} hidden. Squeekchain's list catches up within a few minutes.</p> : null}
          <div className="grid">{visibleTheirs.map((holding) => { const asset = squeekAsset(holding.id); const selected = want.some((item) => sameAsset(item, asset)); return <SqueekCard key={holding.id.toString()} chainId={chainId} id={holding.id} level={holding.level} custody={holding.custody} selected={selected} disabled={(want.length >= MAX_ITEMS && !selected) || locked} onToggle={() => editWant(asset)} /> })}</div>
          <ShowMore shown={Math.min(theirsShown, walletTheirs.length)} total={walletTheirs.length} complete={theirs.complete} onMore={() => setTheirsShown((n) => n + PAGE_SIZE)} />
        </div>
      </section>

      <section className="section">
        <div className="section-head"><div><span className="step">YOUR GENESIS NFTS</span><h2>You give</h2></div><SelectedCount count={give.length} locked={locked} onClear={() => setGive([])} /></div>
        {!address ? <div className="connect-gate"><div><h3>Connect wallet</h3><p>Connect to prove ownership and approve only the exact NFTs you select.</p></div><ConnectButton /></div> : <>
          {switchedFrom ? <div className="panel notice" role="status">
            <h3>Your wallet switched accounts</h3>
            <p>You are now connected as {shortAddress(address)}. The Squeeks you picked to give from {shortAddress(switchedFrom)} were cleared, because only the connected account can give them. To use {shortAddress(switchedFrom)}, switch back to it in your wallet.</p>
            <div className="row-actions"><button type="button" className="text-button" onClick={() => setSwitchedFrom(null)}>Got it</button></div>
          </div> : null}
          <p className="note">Wallet-held Squeek Genesis NFTs appear below automatically.</p>
          {mine.isLoading ? <p className="note">Loading your Genesis NFTs...</p> : null}
          <HoldingsState holdings={mine} walletCount={walletMine.length} who="Your wallet" />
          {goneMine.length > 0 ? <p className="note">{goneMine.map((holding) => `#${holding.id}`).join(', ')} already left your wallet onchain, so {goneMine.length === 1 ? 'it is' : 'they are'} hidden. Squeeks you just received appear within a few minutes, once Squeekchain's list catches up.</p> : null}
          <div className="grid">{visibleMine.map((holding) => { const asset = squeekAsset(holding.id); const selected = give.some((item) => sameAsset(item, asset)); return <SqueekCard key={holding.id.toString()} chainId={chainId} id={holding.id} level={holding.level} custody={holding.custody} selected={selected} disabled={(give.length >= MAX_ITEMS && !selected) || locked} onToggle={() => editGive(asset)} /> })}</div>
          <ShowMore shown={Math.min(mineShown, walletMine.length)} total={walletMine.length} complete={mine.complete} onMore={() => setMineShown((n) => n + PAGE_SIZE)} />
        </>}
      </section>

      <section className="section">
        <div className="section-head"><div><span className="step">CONFIRM THE TRADE</span><h2>Review</h2></div><span className="status open">DRAFT</span></div>
        <div className="sides">
          <div className="side">
            <div className="side-head"><span className="lab">YOU GIVE {give.length}</span>{give.length > 0 ? <button type="button" className="text-button" disabled={locked} onClick={() => setGive([])}>Clear</button> : null}</div>
            {give.length === 0 ? <p className="empty-state">Pick the Squeeks you give above.</p> : <div className="grid">{give.map((asset) => selectedCard(asset, () => editGive(asset)))}</div>}
          </div>
          <span className="swap" aria-hidden="true">⇄</span>
          <div className="side">
            <div className="side-head"><span className="lab">YOU GET {want.length}{counterparty ? ` FROM ${shortAddress(counterparty)}` : ''}</span>{want.length > 0 ? <button type="button" className="text-button" disabled={locked} onClick={() => setWant([])}>Clear</button> : null}</div>
            {want.length === 0 ? <p className="empty-state">Pick the Squeeks you want above.</p> : <div className="grid">{want.map((asset) => selectedCard(asset, () => editWant(asset)))}</div>}
          </div>
        </div>
        {!address ? <div className="panel review-locked"><h3>Your draft is local.</h3><p className="note">Connect above when you are ready to complete both sides.</p></div> : <div className="panel">
          <label className="checkline"><input type="checkbox" checked={privateTaker} onChange={(event) => setPrivateTaker(event.target.checked)} />{counterparty ? `Only ${shortAddress(counterparty)} can accept` : 'Restrict acceptance to the current owner of the wanted NFTs'}</label>
          <label className="field"><span className="lab">Expires after</span><select value={expiryDays} onChange={(event) => setExpiryDays(Number(event.target.value) as ExpiryDays)}>{EXPIRY_DAYS.map((days) => <option key={days} value={days}>{days} {days === 1 ? 'day' : 'days'}</option>)}</select></label>
          {wrongNetwork ? <div className="row-actions"><p className="error">Your wallet is on another network. SqueekSwap runs on Sepolia.</p><button type="button" className="btn" onClick={() => switchChain.mutate({ chainId: chain })}>Switch to Sepolia</button></div> : null}
          <p className="note">Platform fee: 0 ETH. Each approval is limited to one NFT.</p>
          {problem && (give.length > 0 || want.length > 0) ? <p className="error">{problem}</p> : null}
          {overlapping.length > 0 ? <div className="panel danger"><h3>Approval overlap</h3><p>One of these NFTs also appears in an older open offer. Cancel the old offer if you no longer intend it.</p><div className="row-actions">{overlapping.map((record) => <button key={record.id.toString()} type="button" className="btn ghost" disabled={tx.busy} onClick={() => tx.run(`Cancel offer ${record.id}`, () => cancelOffer(config, chain, deployment, record.id))}>Cancel offer {record.id.toString()}</button>)}</div></div> : null}
          {!ready && give.length + want.length > 0 ? <p className="note">Verifying collections, ownership and custody onchain…</p> : null}
          {changedAfterApproval ? <div className="panel notice" role="status">
            <h3>You changed the offer after approving</h3>
            <p>The approvals below were checked again for your new selection. Review both sides before you create the offer.</p>
            <div className="row-actions"><button type="button" className="btn ghost" disabled={locked} onClick={() => { void approvals.refetch(); void account.refetch() }}>Check again</button><button type="button" className="text-button" onClick={() => setApprovedFor(currentKey)}>Got it</button></div>
          </div> : null}
          {staleApprovals.length > 0 ? <div className="panel notice">
            <h3>Approval left on a removed Squeek</h3>
            <p>You approved {staleApprovals.map((asset) => `#${asset.tokenId}`).join(', ')} and then took {staleApprovals.length === 1 ? 'it' : 'them'} out of this offer. SqueekSwap can only move an approved Squeek inside an offer that includes it, but you can remove the approval.</p>
            <div className="row-actions">{staleApprovals.map((asset) => { const open = usedBy(asset); return open
              ? <span key={assetKey(asset)} className="note">#{asset.tokenId.toString()} is in your open offer {open.id.toString()}, so its approval stays.</span>
              : <button key={assetKey(asset)} type="button" className="btn ghost" disabled={locked} onClick={() => revoke(asset)}>Revoke approval for #{asset.tokenId.toString()}</button> })}</div>
          </div> : null}
          {tx.busy ? <p className="note">Finish or reject the request in your wallet before changing the offer.</p> : null}
          <div className="row-actions">{unapproved.map((asset) => <button key={assetKey(asset)} type="button" className="btn ghost" disabled={locked} onClick={() => approve(asset)}>Approve Genesis #{asset.tokenId.toString()}</button>)}<button type="button" className="btn" disabled={!draft || !!problem || unapproved.length > 0 || locked || wrongNetwork} onClick={create}>Create offer <span aria-hidden="true">↗</span></button></div>
          <TxStatus state={tx.state} chainId={chainId} />
        </div>}
      </section>
    </div>
  )
}
