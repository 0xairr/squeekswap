# Build plan and status

## Goal

Ship a builder-campaign-ready NFT swap dapp that launches with the official Squeek Genesis collection, while keeping multi-collection capability in the contract for reviewed future expansion.

## Completed

- Multi-collection `SqueekSwapV2` contract with exact `{collection, tokenId}` assets.
- Atomic 1–8 NFT bundles per side, public or private takers, expiry, cancellation, and nonce-wide revocation.
- Onchain collection registry with ERC-165 admission checks and two-step admin transfer.
- Per-token-only approvals and post-transfer ownership assertions.
- Unit and invariant test sources plus a successful local-EVM integration covering cross-collection fill, stale-offer resistance, registry disable, and admin authorization.
- Genesis-only web flow with the canonical collection clearly marked as official.
- Batched Genesis ownership and level reads, lazy artwork, search, and holder browsing.
- V2 deployed and smoke-tested on Sepolia at `0x28eb722a6abbaf3A69BE0FCC6E026b9D0cEFfBF5`.
- Web typecheck, unit tests (70), and optimized production build passing.
- Source verified: Sourcify exact match (https://repo.sourcify.dev/11155111/0x28eb722a6abbaf3A69BE0FCC6E026b9D0cEFfBF5), Blockscout full match, Etherscan verified (https://sepolia.etherscan.io/address/0x28eb722a6abbaf3A69BE0FCC6E026b9D0cEFfBF5#code). V1 is verified on all three as well.
- 2026-11-04 review: Foundry 30/30 plus 3/3 fork acceptance against live V2 and real Genesis; lookalike collection disabled; non-Genesis offers flagged and blocked in the UI; contract errors decoded; indexer verifies body hashes; per-route rate limits; scroll/selection lag fixed (WebP thumbnails, paged grids, per-token cache).
- Live at https://www.squeekswap.xyz with a public repository (https://github.com/0xairr/squeekswap); Squeekchain project verified on 2026-11-05.
- Seeds points (offchain, from `OfferFilled` and SqueekCore wheel rounds) and WalletConnect for phone wallets.
- 2026-11-05: moved to Squeekchain's relaunched contracts; the registry supports only the relaunched Genesis. See `AUDIT-2026-11-05.md`.
- 2026-11-05, later: Squeekchain opened claims and V2 settled its first three swaps (the builder's test swaps across two wallets, including a 2-for-1 bundle). Added the offer book with swap history, recently claimed Squeeks, the unclaimed-custody guard, the RPC history fallback, wallet reconnect and account-switch handling.

## Release gates still open

- A swap with an outside holder (the first three were the builder's own test swaps).
- A keyed archive RPC in `SEPOLIA_RPC_URL`, so history reads do not depend on public gateways.
- Independent external audit.
