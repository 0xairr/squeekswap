'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { Address } from 'viem'
import { useConfig, useConnection, useSwitchChain, useWatchAsset } from 'wagmi'
import { CopyAddress, NotDeployed, PAGE_SIZE, ShowMore, SqueekCard, TxStatus } from '@/components/Bits'
import { ConnectButton } from '@/components/Header'
import { VaultCalculator } from '@/components/VaultCalculator'
import { claimVault, harvestVault, lockOneSqueek, lockSqueeks, setVaultApproval, unlockSqueeks } from '@/lib/actions'
import { vaultFor } from '@/lib/deployments'
import { addressUrl, chainMismatch, parseIds, same } from '@/lib/format'
import { useActiveSwap, useGenesisInfos, useHoldings, useTx, useVaultApproval, useVaultLocked, useVaultPosition, useVaultStats } from '@/lib/hooks'
import { amount, COIN, coinsForLevel, LEVEL_POWER, sqkMultiplier, unlockCost, type LockedSqueek } from '@/lib/vault'
import { asChainId } from '@/lib/wagmi'

const MAX_PICK = 100
const SYMBOL = 'CHEEKS'
/** Vault Squeeks shown before "Show all"; the rest are a search away. */
const VAULT_PREVIEW = 8

function pick(list: bigint[], id: bigint): bigint[] {
  if (list.includes(id)) return list.filter((item) => item !== id)
  return list.length >= MAX_PICK ? list : [...list, id]
}

type Candidate = { id: bigint; level: number }

/** The wallet's Squeeks per Squeekchain's API plus ones just unlocked here, each listed once. */
function mergeHoldings(api: { id: bigint; level: number; custody: string }[] | undefined, returned: Candidate[]): Candidate[] {
  const seen = new Set<string>()
  const out: Candidate[] = []
  for (const h of [...(api ?? []).filter((item) => item.custody === 'wallet'), ...returned]) {
    const key = h.id.toString()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ id: h.id, level: h.level })
  }
  return out
}

function feeLabel(bps: number): string {
  return `${(bps / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`
}

/** The level whose base power matches (the vault stores power, not level). */
function levelFor(power: bigint): number | null {
  const index = LEVEL_POWER.findIndex((p) => BigInt(p) === power)
  return index === -1 ? null : index + 1
}

/** 1,000 · 2,200 · … · 113K · 1.21M */
function compact(n: number): string {
  if (n < 100_000) return n.toLocaleString('en-US')
  if (n < 1_000_000) return `${Math.round(n / 1000)}K`
  return `${(n / 1_000_000).toFixed(2)}M`
}

/** What each Squeek level mints, as a staircase: every level is 2.2× the one before. */
function LevelLadder() {
  const lo = Math.log10(LEVEL_POWER[0])
  const hi = Math.log10(LEVEL_POWER[LEVEL_POWER.length - 1])
  return (
    <section className="ladder" aria-labelledby="ladder-title">
      <div className="ladder-head">
        <h2 id="ladder-title">CHEEKS per Squeek</h2>
        <p>Each level is worth 2.2× the one below, the same as its Squeekchain power.</p>
      </div>
      <ol className="ladder-steps">
        {LEVEL_POWER.map((value, i) => (
          <li key={i} aria-label={`Level ${i + 1}: ${value.toLocaleString('en-US')} CHEEKS`} style={{ '--h': `${16 + ((Math.log10(value) - lo) / (hi - lo)) * 84}%` } as CSSProperties}>
            <span className="ladder-bar"><b>{compact(value)}</b></span>
            <span className="ladder-level">Lv {i + 1}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

export function VaultClient() {
  const config = useConfig()
  const { address, chainId: walletChainId } = useConnection()
  const switchChain = useSwitchChain()
  const { chainId, deployment } = useActiveSwap()
  const vault = vaultFor(chainId)
  const stats = useVaultStats(chainId)
  const position = useVaultPosition(chainId, address)
  const locked = useVaultLocked(chainId)
  const approval = useVaultApproval(chainId, address)
  const holdings = useHoldings(chainId, address)
  const watch = useWatchAsset()
  const tx = useTx()
  const [toLock, setToLock] = useState<bigint[]>([])
  const [toUnlock, setToUnlock] = useState<bigint[]>([])
  const [lockShown, setLockShown] = useState(PAGE_SIZE)
  const [vaultShown, setVaultShown] = useState(VAULT_PREVIEW)
  const [query, setQuery] = useState('')
  // Squeeks this wallet took out of the vault during this visit; Squeekchain's API lists them ~12 blocks later.
  const [returned, setReturned] = useState<Candidate[]>([])
  // Picks belong to the connected account; a wallet switch clears them.
  const lastAddress = useRef<Address | undefined>(undefined)
  useEffect(() => {
    if (lastAddress.current && !same(lastAddress.current, address)) {
      setToLock([])
      setToUnlock([])
      setReturned([])
    }
    lastAddress.current = address
  }, [address])
  // Squeekchain's account API lags about 12 blocks, so right after a lock it still lists the Squeek as in the
  // wallet. Every card shown for locking is re-read onchain; anything now in the vault or elsewhere is hidden.
  const lockedSet = new Set((locked.data ?? []).map((item) => item.id.toString()))
  const candidates = mergeHoldings(holdings.data, returned)
  const onchain = useGenesisInfos(chainId, candidates.slice(0, lockShown).map((h) => h.id))

  if (!deployment) return <NotDeployed chainId={chainId} />
  const hero = (
    <section className="vault-hero">
      <div className="vault-title">
        <span className="official-badge">SQUEEKSWAP VAULT · SEPOLIA TESTNET</span>
        <h1>Squeek Cheeks.</h1>
        <p className="vault-lede">Lock a Squeek, hold CHEEKS, earn the SQK it makes.</p>
      </div>
      <ol className="vault-steps">
        <li><b>Lock</b><span>A level-1 Squeek gives 1,000 CHEEKS and is staked in Squeekchain at once.</span></li>
        <li><b>Hold</b><span>CHEEKS earn 75% of the vault’s SQK every second. 25% is restaked for good.</span></li>
        <li><b>Burn</b><span>Burn a Squeek’s CHEEKS to take it out. Free, any time.</span></li>
      </ol>
    </section>
  )
  if (!vault) {
    return (
      <div className="stack">
        {hero}
        <section className="empty-callout"><h2>The vault isn’t deployed on Sepolia yet.</h2></section>
      </div>
    )
  }

  const id = asChainId(chainId)
  const wrongChain = !!address && chainMismatch(walletChainId, chainId)
  const s = stats.data
  const p = position.data
  const feeBps = s?.feeBps ?? 0
  const busy = tx.busy
  const refreshAll = 'vault' as const

  // Lock side: Squeeks in this wallet right now (staked ones must leave Squeekchain staking first).
  const wallet = candidates.filter((h) => {
    if (lockedSet.has(h.id.toString())) return false
    const row = onchain.data.find((item) => item.tokenId === h.id)
    return !row || (same(row.owner, address) && row.custody === 'wallet')
  })
  const staked = holdings.data?.filter((h) => h.custody === 'staking') ?? []
  const lockCoins = toLock.reduce((sum, tokenId) => sum + (coinsForLevel(wallet.find((h) => h.id === tokenId)?.level) ?? 0), 0)

  // Vault side: yours first, then by token ID; search by ID reaches any of them.
  const inVault = [...(locked.data ?? [])].sort((a, b) => {
    const mine = Number(same(b.lockedBy, address)) - Number(same(a.lockedBy, address))
    return mine !== 0 ? mine : a.id < b.id ? -1 : 1
  })
  const byId = new Map<string, LockedSqueek>(inVault.map((item) => [item.id.toString(), item]))
  const searched = parseIds(query)
  const matches = searched.length > 0 ? inVault.filter((item) => searched.includes(item.id)) : null
  const vaultCards = matches ?? inVault.slice(0, vaultShown)
  let unlockCoins = 0n
  let unlockFee = 0n
  for (const tokenId of toUnlock) {
    const item = byId.get(tokenId.toString())
    if (!item) continue
    const cost = unlockCost(item.power, item.lockedBy, address, feeBps)
    unlockCoins += cost.coins
    unlockFee += cost.fee
  }
  const coins = p?.coins ?? 0n
  const canAfford = coins >= unlockCoins + unlockFee
  const share = s && s.earning > 0n && p ? Number(p.coins * 10_000n / s.earning) / 100 : 0
  const myPerHour = s?.perThousandPerHour != null && p ? s.perThousandPerHour * p.coins / (1000n * COIN) : null

  async function lock() {
    if (!id || !address || toLock.length === 0) return
    const ids = toLock
    const label = ids.length === 1 ? `Lock Squeek #${ids[0]}` : `Lock ${ids.length} Squeeks`
    const send = ids.length === 1 ? () => lockOneSqueek(config, id, vault!, address, ids[0]) : () => lockSqueeks(config, id, vault!, ids)
    const receipt = await tx.run(label, send, refreshAll)
    if (receipt) setToLock([])
  }

  async function unlock() {
    if (!id || toUnlock.length === 0) return
    const ids = toUnlock
    const coming = ids.map((tokenId) => ({ id: tokenId, level: levelFor(byId.get(tokenId.toString())?.power ?? 0n) ?? 1 }))
    const receipt = await tx.run(ids.length === 1 ? `Unlock Squeek #${ids[0]}` : `Unlock ${ids.length} Squeeks`, () => unlockSqueeks(config, id, vault!, ids), refreshAll)
    if (receipt) {
      setToUnlock([])
      setReturned((list) => [...list, ...coming])
    }
  }

  const switchButton = wrongChain ? <button type="button" className="btn" onClick={() => switchChain.mutate({ chainId })}>Switch to Sepolia</button> : null

  return (
    <div className="stack tight">
      {hero}

      <section className="vault-stats" aria-label="Vault totals">
        <div><span className="lab">SQUEEKS LOCKED</span><b className="big">{s ? s.lockedCount.toLocaleString('en-US') : '…'}</b></div>
        <div><span className="lab">CHEEKS</span><b>{s ? amount(s.supply, 0) : '…'}</b><small>in circulation</small></div>
        <div>
          <span className="lab">EARNING NOW</span>
          {s?.perThousandPerHour != null
            ? <><b>{amount(s.perThousandPerHour, 2)} SQK</b><small>an hour per 1,000 CHEEKS, {Math.ceil(s.streamSecondsLeft / 60)} min left in this block</small></>
            : <><b>Wheel idle</b><small>SQK arrives when Squeektoshi runs</small></>}
        </div>
        <div><span className="lab">HOUSE STAKE</span><b>{s ? amount(s.houseStaked + s.houseOwed, 0) : '…'} SQK</b><small>restaked for good</small></div>
        <div><span className="lab">SQK BOOST</span><b>×{s ? sqkMultiplier(s.nftPower).toLocaleString('en-US', { maximumFractionDigits: 1 }) : '…'}</b><small>on the vault’s staked SQK</small></div>
      </section>

      <LevelLadder />

      <section className="panel vault-you" aria-labelledby="vault-you">
        <h2 id="vault-you">Your CHEEKS</h2>
        {!address ? <div className="row-actions"><ConnectButton /></div> : (
          <>
            <div className="vault-me">
              <div><span className="lab">HOLDING</span><b>{p ? amount(p.coins) : '…'}</b><small>{share ? `${share.toLocaleString('en-US')}% of all earning CHEEKS` : SYMBOL}</small></div>
              <div><span className="lab">TO CLAIM</span><b>{p ? amount(p.pendingSqk, 4) : '…'} SQK</b><small>{p && p.pendingCoins > 0n ? `+ ${amount(p.pendingCoins)} CHEEKS from fees` : 'grows while you hold'}</small></div>
              <div><span className="lab">RIGHT NOW</span><b>{myPerHour != null ? `${amount(myPerHour, 4)} SQK` : '—'}</b><small>{myPerHour != null ? 'an hour' : 'wheel idle'}</small></div>
            </div>
            <div className="row-actions">
              {switchButton}
              <button type="button" className="btn" disabled={busy || wrongChain || !p || (p.pendingSqk === 0n && p.pendingCoins === 0n)} onClick={() => id && tx.run('Claim SQK', () => claimVault(config, id, vault), refreshAll)}>Claim SQK</button>
              <button type="button" className="btn ghost" disabled={busy || wrongChain} onClick={() => id && tx.run('Collect for everyone', () => harvestVault(config, id, vault), refreshAll)}>Collect for everyone</button>
              <button type="button" className="text-button" onClick={() => watch.mutate({ type: 'ERC20', options: { address: vault.vault, symbol: SYMBOL, decimals: 18 } })}>Add CHEEKS to wallet</button>
              <button type="button" className="text-button" onClick={() => watch.mutate({ type: 'ERC20', options: { address: vault.sqk, symbol: 'SQK', decimals: 18 } })}>Add SQK to wallet</button>
            </div>
          </>
        )}
        <TxStatus state={tx.state} chainId={chainId} />
      </section>

      <section className="panel" aria-labelledby="vault-lock">
        <div className="panel-row">
          <h2 id="vault-lock">Lock</h2>
          {address ? (
            <span className="row-actions">
              <span className="pick-sum"><b>{toLock.length}</b> picked · <b>{lockCoins.toLocaleString('en-US')}</b> CHEEKS</span>
              {switchButton}
              {toLock.length > 1 && approval.data === false ? (
                <button type="button" className="btn" disabled={busy || wrongChain} onClick={() => id && tx.run('Approve the vault for your Squeeks', () => setVaultApproval(config, id, vault, true), refreshAll)}>Approve vault</button>
              ) : (
                <button type="button" className="btn" disabled={busy || wrongChain || toLock.length === 0 || !!s?.intakePaused} onClick={lock}>{toLock.length > 1 ? `Lock ${toLock.length}` : 'Lock'}</button>
              )}
            </span>
          ) : <ConnectButton />}
        </div>
        {address ? (
          <>
            {s?.intakePaused ? <p className="error">Squeekchain staking is paused, so locking is off. Unlocking and claiming still work.</p> : null}
            {holdings.isLoading ? <p className="note">Loading your Squeeks…</p> : null}
            {holdings.error ? <p className="error">Couldn’t load your Squeeks from Squeekchain. Try again in a moment.</p> : null}
            {!holdings.isLoading && holdings.complete && wallet.length === 0 ? <p className="empty-state">No Squeeks in this wallet to lock.{staked.length > 0 ? ` ${staked.length} ${staked.length === 1 ? 'is' : 'are'} staked in Squeekchain; withdraw there first (free).` : ''}</p> : null}
            <div className="grid">
              {wallet.slice(0, lockShown).map((h) => (
                <SqueekCard key={h.id.toString()} chainId={chainId} id={h.id} level={h.level} caption={coinsForLevel(h.level) ? `+${coinsForLevel(h.level)!.toLocaleString('en-US')} CHEEKS` : undefined} selected={toLock.includes(h.id)} disabled={busy} onToggle={() => setToLock((list) => pick(list, h.id))} />
              ))}
            </div>
            <ShowMore shown={Math.min(lockShown, wallet.length)} total={wallet.length} complete={holdings.complete} onMore={() => setLockShown((n) => n + PAGE_SIZE)} />
            {approval.data ? <button type="button" className="text-button" disabled={busy || wrongChain} onClick={() => id && tx.run('Remove vault approval', () => setVaultApproval(config, id, vault, false), refreshAll)}>Remove the vault’s approval</button> : null}
          </>
        ) : null}
      </section>

      <section className="panel" aria-labelledby="vault-in">
        <div className="panel-row">
          <h2 id="vault-in">In the vault <small>{inVault.length.toLocaleString('en-US')}</small></h2>
          <label className="vault-search">
            <span className="sr-only">Find a Squeek in the vault by ID</span>
            <input inputMode="numeric" placeholder="Find by ID, e.g. 27" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
        </div>
        {locked.isLoading ? <p className="note">Reading the vault…</p> : null}
        {locked.error ? <p className="error">Couldn’t read the vault’s Squeeks.</p> : null}
        {!locked.isLoading && inVault.length === 0 ? <p className="empty-state">Empty. The first Squeek locked shows up here.</p> : null}
        {matches && matches.length === 0 ? <p className="empty-state">No Squeek #{query.trim()} in the vault.</p> : null}
        <div className="grid">
          {vaultCards.map((item) => {
            const cost = unlockCost(item.power, item.lockedBy, address, feeBps)
            const mine = same(item.lockedBy, address)
            const caption = `${amount(cost.coins + cost.fee, 0)} CHEEKS${mine ? ' · yours' : cost.fee > 0n ? ` incl. ${feeLabel(feeBps)} fee` : ''}`
            return <SqueekCard key={item.id.toString()} chainId={chainId} id={item.id} level={levelFor(item.power)} caption={caption} selected={toUnlock.includes(item.id)} disabled={busy || !address} onToggle={() => setToUnlock((list) => pick(list, item.id))} />
          })}
        </div>
        {!matches && inVault.length > VAULT_PREVIEW ? (
          vaultShown <= VAULT_PREVIEW
            ? <div className="row-actions"><button type="button" className="btn ghost" onClick={() => setVaultShown(PAGE_SIZE)}>Show all {inVault.length.toLocaleString('en-US')}</button></div>
            : <ShowMore shown={Math.min(vaultShown, inVault.length)} total={inVault.length} onMore={() => setVaultShown((n) => n + PAGE_SIZE)} />
        ) : null}
        {address && inVault.length > 0 ? (
          <div className="vault-action">
            <span><b>{toUnlock.length}</b> picked · burns <b>{amount(unlockCoins + unlockFee, 2)}</b> CHEEKS{unlockFee > 0n ? ` (${amount(unlockFee, 2)} fee to holders)` : ''}</span>
            <span className="row-actions">
              {switchButton}
              {!canAfford && toUnlock.length > 0 ? <span className="error">You hold {amount(coins)}.</span> : null}
              <button type="button" className="btn" disabled={busy || wrongChain || toUnlock.length === 0 || !canAfford} onClick={unlock}>{toUnlock.length > 1 ? `Unlock ${toUnlock.length}` : 'Unlock'}</button>
            </span>
          </div>
        ) : null}
      </section>

      <VaultCalculator stats={s} />

      <details className="panel notice vault-rules">
        <summary><h2>How the contract works</h2></summary>
        <ul className="plain-list">
          <li>CHEEKS exist only for Squeeks in the vault: total CHEEKS always equal the vault’s Squeek power.</li>
          <li>Any Squeek can come out for its CHEEKS, including ones someone else locked. Taking back your own is always free.</li>
          <li>No one, including the owner, can move a locked Squeek, your CHEEKS or your SQK.</li>
          <li>The owner can only set an unlock fee: at most 5%, announced 3 days ahead, never on your own Squeek. It is {feeLabel(feeBps)}.</li>
          <li>The house stake (25% of SQK) never comes out. It only adds power to the vault.</li>
          <li>“Collect for everyone” pulls the vault’s SQK from Squeekchain and restakes the house share. Claiming does this too.</li>
          <li>While locked, Squeekchain lists the vault as the staker. If Squeekchain ever gives stakers more than SQK, unlock yours first.</li>
          <li>Wallets earn, including smart wallets. CHEEKS parked in other apps’ contracts earn SQK nobody can claim.</li>
          <li>Testnet only. Squeeks, CHEEKS and SQK here have no value.</li>
        </ul>
        <p className="note">Contract <CopyAddress address={vault.vault} href={addressUrl(chainId, vault.vault) ?? '#'} /></p>
      </details>
    </div>
  )
}
