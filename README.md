# SqueekSwap

**Live: https://www.squeekswap.xyz**

Trade Squeek Genesis NFTs with other holders on Ethereum Sepolia, the testnet Squeekchain runs on. Pick the exact Genesis IDs on both sides; everything swaps in one transaction, or nothing moves. There is no sale price, escrow or fee: your NFTs stay in your wallet until the swap settles.

Completed swaps earn **Seeds**, and a swap that lands while Squeektoshi, the hamster whose wheel powers Squeekchain, is running earns double. Whether he was running is read onchain from SqueekCore.

## On the site

- **Make an offer** (`/new`): pick the Squeeks you want from recently claimed ones, by token ID, or from any holder's wallet, then the ones you give. Remove picks at any time; every approval covers one exact Squeek.
- **Offer book** (`/offers`): open offers, the history of completed swaps, and closed offers.
- **Offer page**: both sides with their current owners and levels; the wallet it is for accepts in one transaction.
- **Seeds** (`/seeds`): the leaderboard and your own Seeds.

## Status (2026-11-05)

- Squeekchain opened its free Sepolia Genesis claim. Claimed Squeeks show up on the site within minutes.
- SqueekSwap V2 has settled its first three swaps: test swaps by the builder across two wallets, including a 2-for-1 bundle. No outside holder has traded yet.

## How it works

- **Contract** (`contracts/squeek-src/SqueekSwapV2.sol`, verified): an offer stores only a hash of its exact assets. `fill` re-checks ownership and per-token approvals on both sides, moves both bundles in one transaction, then asserts the new owners. Up to 8 NFTs per side. No escrow, fee, proxy or upgrade path; only token-specific approvals count.
- **Web** (`web/`, Next.js): a server indexer rebuilds offers from contract events and shows an offer only when its body hashes to the onchain record. Genesis artwork is read from the contract's onchain `tokenURI` and served as cached thumbnails. Holdings and the live wheel status come from Squeekchain's public API, which lists changes 12 confirmations late, so the cards on screen are re-checked onchain. Server history reads fall back to a full-history RPC.
- **Seeds** (`web/lib/seeds.ts`, `docs/squeekswap/SEEDS.md`): points computed from public chain data, with a daily cap of 3 scored swaps, one scored swap per wallet pair per day, and a 3-day per-NFT cooldown. Seeds are not Squeekchain Aura.

## Contracts (Ethereum Sepolia)

- SqueekSwap V2: [`0x28eb722a6abbaf3A69BE0FCC6E026b9D0cEFfBF5`](https://sepolia.etherscan.io/address/0x28eb722a6abbaf3A69BE0FCC6E026b9D0cEFfBF5#code), verified on Etherscan, Sourcify (exact match) and Blockscout
- Official Squeek Genesis: [`0xc4c7982657f00509548f3a3a41db7fa439a6856b`](https://sepolia.etherscan.io/address/0xc4c7982657f00509548f3a3a41db7fa439a6856b)

The contract supports a registry of ERC-721 collections; the website trades only official Squeek Genesis.

## Run it

```bash
cd web
npm install
npm test          # 70 unit tests
npm run typecheck
npm run dev       # http://localhost:3000
```

Contracts use Foundry:

```bash
cd contracts
forge test -vv                                    # unit and invariant suites
SQUEEK_FORK=1 forge test --match-contract Fork    # swaps real Genesis NFTs on a local Sepolia fork
```

## Repository

- `contracts/squeek-src/` — SqueekSwap V2 (live) and V1, plus test mocks
- `contracts/squeek-test/` — unit, invariant and fork acceptance tests
- `contracts/artifacts/` — the exact compiled artifacts that match the deployed bytecode
- `web/` — the Next.js app and its read-only APIs
- `docs/squeekswap/` — architecture, security, Seeds rules and audit notes

squeekchain-project: 23acb0a5-e34f-4f8e-840d-f6780cbd1b81
