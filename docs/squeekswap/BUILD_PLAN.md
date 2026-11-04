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
- Web typecheck, unit tests (45), and optimized production build passing.
- Source verified: Sourcify exact match (https://repo.sourcify.dev/11155111/0x28eb722a6abbaf3A69BE0FCC6E026b9D0cEFfBF5), Blockscout full match, Etherscan verified (https://sepolia.etherscan.io/address/0x28eb722a6abbaf3A69BE0FCC6E026b9D0cEFfBF5#code). V1 is verified on all three as well.
- 2026-11-04 review: Foundry 30/30 plus 3/3 fork acceptance against live V2 and real Genesis; lookalike collection disabled; non-Genesis offers flagged and blocked in the UI; contract errors decoded; indexer verifies body hashes; per-route rate limits; scroll/selection lag fixed (WebP thumbnails, paged grids, per-token cache).

## Release gates still open

- Complete one real two-wallet create/approve/fill demonstration on Sepolia.
- Add points only after its anti-farming rules and indexing model are specified; no points logic is in V2.
