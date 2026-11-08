import Link from 'next/link'
import type { ReactNode } from 'react'
import { CANONICAL_SQK, CANONICAL_SQUEEK, deploymentFor, SQUEEK_CHAIN_ID, vaultFor } from '@/lib/deployments'
import { LEVEL_POWER } from '@/lib/vault'

export const metadata = {
  title: 'Docs · SqueekSwap',
  description: 'How to swap Squeek Genesis NFTs, earn Seeds, and use the Squeek Cheeks vault.',
}

const TOC: { id: string; label: string; children?: { id: string; label: string }[] }[] = [
  { id: 'start', label: 'Start here' },
  { id: 'swap', label: 'Swap', children: [{ id: 'make', label: 'Make an offer' }, { id: 'accept', label: 'Accept an offer' }, { id: 'manage', label: 'Your offers' }, { id: 'reasons', label: 'If an offer won’t fill' }] },
  { id: 'seeds', label: 'Seeds' },
  { id: 'vault', label: 'Vault', children: [{ id: 'cheeks', label: 'CHEEKS per level' }, { id: 'lock', label: 'Lock' }, { id: 'earn', label: 'Earn and claim' }, { id: 'unlock', label: 'Unlock' }, { id: 'calculator', label: 'Calculator' }, { id: 'vault-rules', label: 'Good to know' }] },
  { id: 'contracts', label: 'Contracts' },
  { id: 'developers', label: 'For developers' },
  { id: 'faq', label: 'FAQ' },
]

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return <section id={id} className="docs-section"><h2>{title}</h2>{children}</section>
}

function Sub({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return <div id={id} className="docs-sub"><h3>{title}</h3>{children}</div>
}

function Address({ value }: { value: string }) {
  return <a className="mono" href={`https://sepolia.etherscan.io/address/${value}`} target="_blank" rel="noreferrer">{value}</a>
}

export default function DocsPage() {
  const swap = deploymentFor(SQUEEK_CHAIN_ID)
  const vault = vaultFor(SQUEEK_CHAIN_ID)
  return (
    <div className="docs">
      <aside className="docs-nav" aria-label="Docs contents">
        <span className="lab">DOCS</span>
        <ol>
          {TOC.map((item) => (
            <li key={item.id}>
              <a href={`#${item.id}`}>{item.label}</a>
              {item.children ? <ol>{item.children.map((child) => <li key={child.id}><a href={`#${child.id}`}>{child.label}</a></li>)}</ol> : null}
            </li>
          ))}
        </ol>
      </aside>

      <article className="docs-body">
        <header className="docs-head">
          <span className="official-badge">SQUEEKSWAP DOCS · SEPOLIA TESTNET</span>
          <h1>How it all works.</h1>
          <p>Swap Squeek Genesis NFTs, earn Seeds, and lock Squeeks in the Squeek Cheeks vault.</p>
        </header>

        <Section id="start" title="Start here">
          <ul>
            <li>Connect a browser wallet or use WalletConnect, and switch it to <b>Ethereum Sepolia</b>.</li>
            <li>Keep a little Sepolia ETH for gas.</li>
            <li>Only official Squeek Genesis NFTs are supported. Everything is on testnet and has no real value.</li>
          </ul>
        </Section>

        <Section id="swap" title="Swap">
          <p>Trade exact Squeeks for exact Squeeks, up to 8 on each side. Both sides move in one transaction or nothing moves. No price, no fee.</p>
          <Sub id="make" title="Make an offer">
            <ol className="docs-steps">
              <li>Open <Link href="/new">New offer</Link> and pick the Squeeks you want. They must all be in one wallet.</li>
              <li>Pick the Squeeks you give.</li>
              <li>Choose who can accept and how long the offer stays open (1, 7 or 30 days).</li>
              <li>Approve each Squeek you give, then create the offer.</li>
            </ol>
          </Sub>
          <Sub id="accept" title="Accept an offer">
            <ol className="docs-steps">
              <li>Open the offer from the <Link href="/offers">Offer book</Link> or a shared link.</li>
              <li>Approve each Squeek it asks you for.</li>
              <li>Press <b>Swap</b>.</li>
            </ol>
          </Sub>
          <Sub id="manage" title="Your offers">
            <ul>
              <li><b>Cancel</b> closes one offer. <b>Withdraw all offers</b> on the <Link href="/">home page</Link> closes every one.</li>
              <li>Offers expire on their own.</li>
              <li>Staked Squeeks can’t be swapped; withdraw them from Squeekchain staking first.</li>
            </ul>
          </Sub>
          <Sub id="reasons" title="If an offer won’t fill">
            <table className="docs-table">
              <tbody>
                <tr><td>Approve each requested NFT first.</td><td>Approve every Squeek the offer asks for.</td></tr>
                <tr><td>Your wallet does not hold every NFT this offer asks for.</td><td>Use the wallet that holds them.</td></tr>
                <tr><td>The maker no longer holds every offered NFT.</td><td>The offer is dead; ask for a new one.</td></tr>
                <tr><td>This offer is for a different wallet.</td><td>Only the named wallet can accept.</td></tr>
              </tbody>
            </table>
          </Sub>
        </Section>

        <Section id="seeds" title="Seeds">
          <p>Points for completed Genesis swaps. See the <Link href="/seeds">leaderboard</Link>.</p>
          <table className="docs-table">
            <tbody>
              <tr><td>Per swap, each wallet</td><td>10 Seeds, +2 per Squeek beyond two</td></tr>
              <tr><td>Zoomies</td><td>×2 if Squeektoshi was running</td></tr>
              <tr><td>Limits</td><td>3 swaps a day, one per wallet pair a day, each Squeek once every 3 days</td></tr>
            </tbody>
          </table>
        </Section>

        <Section id="vault" title="Vault: Squeek Cheeks">
          <p>Lock a Squeek, get CHEEKS, earn the SQK it makes. CHEEKS holders get 75% of the vault’s SQK; 25% is restaked to grow the vault.</p>
          <Sub id="cheeks" title="CHEEKS per level">
            <table className="docs-table docs-levels">
              <thead><tr><th>Level</th><th>CHEEKS</th></tr></thead>
              <tbody>{LEVEL_POWER.map((value, i) => <tr key={i}><td>{i + 1}</td><td>{value.toLocaleString('en-US')}</td></tr>)}</tbody>
            </table>
          </Sub>
          <Sub id="lock" title="Lock">
            <ul>
              <li>Pick Squeeks in the <Link href="/vault">vault</Link>’s Lock panel. One Squeek locks in one transaction; several need one approval first.</li>
              <li>CHEEKS arrive in your wallet straight away.</li>
            </ul>
          </Sub>
          <Sub id="earn" title="Earn and claim">
            <ul>
              <li>Holding CHEEKS is enough to earn. Your share is your CHEEKS out of all CHEEKS.</li>
              <li>SQK arrives only when Squeektoshi runs.</li>
              <li><b>Claim SQK</b> sends your earnings to your wallet. Selling CHEEKS never loses what you already earned.</li>
            </ul>
          </Sub>
          <Sub id="unlock" title="Unlock">
            <ul>
              <li>Burn a Squeek’s CHEEKS to take it out, any Squeek in the vault. No fee.</li>
              <li>Taking back the Squeek you locked is always free.</li>
            </ul>
          </Sub>
          <Sub id="calculator" title="Calculator">
            <p>Compares what your Squeeks earn staked alone with locking them in the vault, using live Squeekchain numbers. It’s an estimate.</p>
          </Sub>
          <Sub id="vault-rules" title="Good to know">
            <ul>
              <li>No one, including the owner, can move a locked Squeek, your CHEEKS or your SQK.</li>
              <li>Lock only through the site. Sending a Squeek to the vault with a plain transfer loses it.</li>
              <li>A new, small vault pays a bit less than staking alone at first, then pulls ahead as it grows.</li>
            </ul>
          </Sub>
        </Section>

        <Section id="contracts" title="Contracts">
          <table className="docs-table docs-contracts">
            <tbody>
              {swap ? <tr><td>SqueekSwap</td><td><Address value={swap.swap} /></td></tr> : null}
              {vault ? <tr><td>Squeek Cheeks vault</td><td><Address value={vault.vault} /></td></tr> : null}
              <tr><td>Squeek Genesis</td><td><Address value={CANONICAL_SQUEEK} /></td></tr>
              <tr><td>SQK</td><td><Address value={CANONICAL_SQK} /></td></tr>
            </tbody>
          </table>
          <p className="note">SqueekSwap and the vault are verified on Etherscan. Source: <a href="https://github.com/0xairr/squeekswap" target="_blank" rel="noreferrer">github.com/0xairr/squeekswap</a>.</p>
        </Section>

        <Section id="developers" title="For developers">
          <ul>
            <li><a href="/llms.txt">/llms.txt</a>: a plain-text guide to both contracts.</li>
            <li><code>/api/offers</code>, <code>/api/genesis</code> and <code>/api/seeds</code> return offers, Squeek details and Seeds as JSON.</li>
          </ul>
        </Section>

        <Section id="faq" title="FAQ">
          <dl className="docs-faq">
            <dt>Is there a fee?</dt>
            <dd>No. You only pay Sepolia gas.</dd>
            <dt>My Squeek isn’t showing.</dt>
            <dd>New changes can take a minute to appear. Reload shortly.</dd>
            <dt>Why does the vault say “Wheel idle”?</dt>
            <dd>SQK is only made while Squeektoshi runs, mostly at night (UTC).</dd>
          </dl>
        </Section>
      </article>
    </div>
  )
}
