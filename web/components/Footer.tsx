import { CANONICAL_SQUEEK, deploymentFor, SQUEEK_CHAIN_ID } from '@/lib/deployments'

const REPO_URL = 'https://github.com/0xairr/squeekswap'
const etherscan = (address: string) => `https://sepolia.etherscan.io/address/${address}#code`

export function Footer() {
  const swap = deploymentFor(SQUEEK_CHAIN_ID)?.swap
  return (
    <footer className="footer">
      <div>
        <b>SqueekSwap</b>
        <p>Swap Squeeks with other holders. Both sides move in one transaction, or nothing moves. No fees. Runs on Sepolia, alongside Squeekchain.</p>
      </div>
      <nav aria-label="Project links">
        <span className="lab">ONCHAIN</span>
        {swap ? <a href={etherscan(swap)} target="_blank" rel="noreferrer">SqueekSwap V2 contract (verified)</a> : null}
        <a href={etherscan(CANONICAL_SQUEEK)} target="_blank" rel="noreferrer">Squeek Genesis collection</a>
      </nav>
      <nav aria-label="Source and docs">
        <span className="lab">SOURCE</span>
        <a href={REPO_URL} target="_blank" rel="noreferrer">GitHub repository</a>
        <a href="/llms.txt">Integration guide</a>
        <a href="https://squeekchain.com" target="_blank" rel="noreferrer">Squeekchain</a>
      </nav>
    </footer>
  )
}
