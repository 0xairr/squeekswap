'use client'

import Link from 'next/link'
import { useRef } from 'react'
import { useConnect, useConnection, useConnectors, useDisconnect, type Connector, type CreateConnectorFn } from 'wagmi'
import { friendlyError } from '@/lib/errors'
import { walletConnectConnector } from '@/lib/wagmi'
import { shortAddress } from '@/lib/format'
import { SeedMark } from './Marks'
import { WheelPill } from './Seeds'

/**
 * Wallet picker: every installed browser wallet found through EIP-6963 (with its own name and icon), a generic
 * browser-wallet fallback, and WalletConnect for phone wallets.
 */
export function ConnectButton() {
  const { address, status } = useConnection()
  const connectors = useConnectors()
  const connect = useConnect()
  const disconnect = useDisconnect()
  const dialog = useRef<HTMLDialogElement>(null)
  if (status === 'connected' && address) return <button type="button" className="btn ghost" onClick={() => disconnect.mutate()}>Disconnect {shortAddress(address)}</button>

  const discovered = connectors.filter((c) => c.type === 'injected' && c.id !== 'injected')
  const generic = connectors.find((c) => c.id === 'injected')
  const hasInjected = typeof window !== 'undefined' && 'ethereum' in window
  const browserWallets = discovered.length > 0 ? discovered : hasInjected && generic ? [generic] : []

  function choose(connector: Connector | CreateConnectorFn) {
    // Close first: WalletConnect opens its own QR modal, which must not sit under this dialog.
    dialog.current?.close()
    connect.mutate({ connector })
  }

  return (
    <span className="row-actions">
      <button type="button" className="btn" disabled={connect.isPending} onClick={() => dialog.current?.showModal()}>{connect.isPending ? 'Connecting…' : 'Connect wallet'}</button>
      {connect.error ? <span className="error">{friendlyError(connect.error)}</span> : null}
      <dialog ref={dialog} className="wallet-dialog" aria-labelledby="wallet-dialog-title" onClick={(event) => { if (event.target === dialog.current) dialog.current?.close() }}>
        <div className="wallet-dialog-head"><h2 id="wallet-dialog-title">Connect a wallet</h2><button type="button" className="text-button" onClick={() => dialog.current?.close()}>Close</button></div>
        {browserWallets.length > 0 ? <span className="lab">BROWSER WALLETS</span> : null}
        {browserWallets.map((connector) => (
          <button key={connector.uid} type="button" className="wallet-option" onClick={() => choose(connector)}>
            {connector.icon ? <img src={connector.icon} alt="" width={28} height={28} /> : <span className="wallet-icon" aria-hidden="true" />}
            <span><b>{connector.id === 'injected' ? 'Browser wallet' : connector.name}</b></span>
          </button>
        ))}
        {browserWallets.length === 0 ? <p className="note">No browser wallet found on this device. Use WalletConnect, or install MetaMask or Rabby.</p> : null}
        <span className="lab">PHONE WALLETS</span>
        <button type="button" className="wallet-option" onClick={() => choose(walletConnectConnector())}>
          <span className="wallet-icon wc" aria-hidden="true">WC</span>
          <span><b>WalletConnect</b><small>Scan a QR code with any phone wallet</small></span>
        </button>
        <p className="note">SqueekSwap runs on Ethereum Sepolia. Approvals are always for one exact NFT.</p>
      </dialog>
    </span>
  )
}

export function Header() {
  return (
    <header className="header">
      <Link href="/" className="wordmark" aria-label="SqueekSwap home"><span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 48 48" role="img"><path className="brand-lime" d="M6 8h27v6h7L29 24 18 14h9v-2H6z" /><path className="brand-orange" d="M42 40H15v-6H8l11-10 11 10h-9v2h21z" /></svg></span><span className="brand-name"><b>SQUEEK</b><i>SWAP</i></span></Link>
      <nav className="nav" aria-label="Main navigation"><Link href="/new">New offer</Link><Link href="/offers">Offer book</Link><Link href="/seeds" className="nav-seeds"><SeedMark /> Seeds</Link></nav>
      <div className="tools"><WheelPill /><ConnectButton /></div>
    </header>
  )
}
