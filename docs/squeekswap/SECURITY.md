# Security model

## Trust assumptions

- Users trust the immutable V2 bytecode to execute the documented checks.
- Users trust the registry admin only to choose supported collections. That role has no asset-transfer or upgrade authority.
- Users must inspect exact collection addresses and token IDs; names and images are untrusted metadata.
- Admitted ERC-721 contracts are assumed to implement standard ownership, approval clearing, and transfer semantics.

## Contract controls

- Non-custodial: the contract never escrows NFTs or ETH.
- Reentrancy guard on create/fill.
- Checks-effects-interactions in fill.
- Exact offer hash prevents body substitution.
- `create` checks current ownership of offered NFTs and a single current owner of wanted NFTs. It does not check approvals; `fill` checks ownership and token-specific approval on both sides. The website asks makers to approve before creating.
- Global `isApprovedForAll` is not accepted.
- Assets must be unique within and across both sides.
- All wanted assets must currently share one owner.
- Supported collection check on create and fill.
- Maximum eight assets per side and 90-day expiry.
- Post-transfer ownership assertions for both bundles.
- No proxy, delegatecall, fee path, arbitrary call, rescue function, or admin transfer function.

## Stale-offer protection

Standard ERC-721 transfers clear `getApproved(tokenId)`. Because V2 accepts only that approval type, an NFT that leaves and later returns to a maker cannot revive an old offer until the maker explicitly approves that token again. Users should still cancel offers they no longer intend.

## Web controls

- Wallet writes use `simulateContract` before submission.
- The web app never receives or transmits a private key.
- Generic metadata fetches use a rate-limited same-origin route and are limited by scheme, host, response size, and timeout.
- The launch selector is pinned to the canonical Genesis contract. Any offer containing another contract is flagged `NOT OFFICIAL GENESIS`, excluded from the inbox, and cannot be accepted through the website; metadata and art of other contracts are never fetched.
- The registry admits only official Genesis. The lookalike `0x0eAF…05c6` (same `Squeek`/`SQUEEK` name) was disabled on 2026-11-04, and the retired first Genesis `0xCB98…B70F` on 2026-11-05 after Squeekchain relaunched.
- The offer index shows a body only when `keccak256(abi.encode(offer))` matches `records[id].hash`, re-reads the newest 12 blocks every refresh, and keeps re-checking filled/closed statuses for 12 blocks.
- Every custom contract error and the OpenZeppelin ERC-721 errors are in the web ABI, so reverts are explained in plain words.
- Squeeks still in Squeekchain's test dispenser are `unclaimed`: they cannot be selected, and an offer that wants one is refused before signing.
- The offer's selection is locked while a wallet request is open. A change after an approval is flagged and the approvals are re-checked, and an approval left on a removed Squeek can be revoked.
- When the connected account changes, Squeeks picked to give are cleared and the switch is announced.
- Ownership shown in wallet grids is re-checked onchain; `/api/genesis` is not browser-cached and lives at most 5 s at the CDN.
- Genesis ownership and levels use a small batched chain read. Artwork is separated from authorization data and loaded lazily.
- The same-origin RPC gateway allowlists read/simulation methods, rejects `eth_sendRawTransaction`, refuses cross-site browser use, measures the real body size, and charges one rate-limit unit per batched call. Each traffic class (API, RPC, artwork) has its own per-client budget plus a server-wide ceiling, so spoofed proxy headers cannot buy unlimited upstream reads.
- JSX text rendering prevents metadata HTML injection.
- Arbitrary SVG metadata data URLs are rejected. Official Genesis SVG artwork is served only through the same-origin image proxy with `nosniff`, caching, and a sandboxed content-security policy.
- API endpoints are read-only; they are not transaction authorization sources.

## Wallets

- Browser wallets are discovered through EIP-6963 (MetaMask, Rabby, Coinbase and others, each listed by name); a generic injected fallback covers the rest.
- Phone wallets connect through WalletConnect, using a public Reown Cloud project ID. The connector is created only when chosen, so it adds nothing to page load. The domains allowed to use the ID are managed at cloud.reown.com and must include `squeekswap.xyz` and `www.squeekswap.xyz`. Override with `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`.
- Accepted risk: WalletConnect's provider bundles Reown AppKit, which depends on zod below 4.6.6 (GHSA-mrhx-c7xc-m3w5, memory exhaustion while validating oversized collections; no fix available). `npm audit` reports it as high. Impact is limited to the user's own browser tab during a WalletConnect session; it cannot reach funds, keys or the server. Re-check when Reown ships a fixed zod.
- `web/.npmrc` sets `legacy-peer-deps=true`: wagmi 3 lists optional peers (accounts, privy, permissionless) whose `ox` range conflicts with viem's. They are unused here.

## Known limitations

- A malicious or highly non-standard ERC-721 can violate assumptions despite claiming ERC-165 support. Admit collections only after review.
- Registry disable is a governance availability risk for live offers.
- Public offers reveal intended token IDs onchain.
- Front-running can win a public offer, but cannot change its exact assets or maker.
- Re-enabling a disabled collection revives its unexpired offers (covered by `test_ReEnablingACollectionRevivesUnexpiredOffers`).
- Offers bind token IDs, not token state. Genesis `merge()` can change a level before acceptance; the offer page warns when a level differs from the level recorded at creation.
- The registry admin is a single externally owned account.
- Foundry: 30/30 local tests and 4/4 fork acceptance tests against the relaunched Genesis pass (2026-11-05).
- The relaunched Genesis contract's source is not published or verified. Its bytecode function list is standard ERC-721 plus merge, mint and reveal controls, it is not upgradeable, and fork tests confirm transfers, approval clearing and level persistence.
- Holdings depend on Squeekchain's API format. If Squeekchain relaunches again, the contract-graph check fails closed: holdings show an error until the build is updated.
- Server history reads use public RPCs (publicnode, then Tenderly's public gateway) unless `SEPOLIA_RPC_URL` is set. If both refuse old log ranges, Seeds and the claims list return an error rather than partial data.
- Holdings come from Squeekchain's API, 12 confirmations behind the chain. Squeeks just received appear a few minutes later.
- No independent external audit has been completed.
