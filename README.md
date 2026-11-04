# SqueekSwap

**Live: https://www.squeekswap.xyz**

Trade Squeek Genesis NFTs with other holders on Ethereum Sepolia, the testnet Squeekchain runs on. Pick the exact Genesis IDs on both sides; everything swaps in one transaction, or nothing moves. There is no sale price, escrow or fee: your NFTs stay in your wallet until the swap settles.

Every completed swap earns **Seeds**, and a swap that lands while Squeektoshi, the hamster whose wheel powers Squeekchain, is running earns double. Whether he was running is read onchain from SqueekCore.

## How it works

- **Contract** (`contracts/squeek-src/SqueekSwapV2.sol`, verified): an offer stores only a hash of its exact assets. `fill` re-checks ownership and per-token approvals on both sides, moves both bundles in one transaction, then asserts the new owners. Up to 8 NFTs per side. No escrow, fee, proxy or upgrade path; only token-specific approvals count.
- **Web** (`web/`, Next.js): a server indexer rebuilds offers from contract events and shows an offer only when its body hashes to the onchain record. Genesis artwork is read from the contract's onchain `tokenURI` and served as cached thumbnails. Holdings and the live wheel status come from Squeekchain's public API.
- **Seeds** (`web/lib/seeds.ts`, `docs/squeekswap/SEEDS.md`): points computed from public chain data, with a daily cap of 3 scored swaps, one scored swap per wallet pair per day, and a 3-day per-NFT cooldown. Seeds are not Squeekchain Aura.

## Contracts (Ethereum Sepolia)

- SqueekSwap V2: [`0x28eb722a6abbaf3A69BE0FCC6E026b9D0cEFfBF5`](https://sepolia.etherscan.io/address/0x28eb722a6abbaf3A69BE0FCC6E026b9D0cEFfBF5#code), verified on Etherscan, Sourcify (exact match) and Blockscout
- Official Squeek Genesis: [`0xCB98349c134aB983dA5BfD80527dfe2552bDB70F`](https://sepolia.etherscan.io/address/0xCB98349c134aB983dA5BfD80527dfe2552bDB70F)

The contract supports a registry of ERC-721 collections; the website trades only official Squeek Genesis.

## Run it

```bash
cd web
npm install
npm test          # unit tests
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
