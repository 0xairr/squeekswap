# Architecture

## Components

| Component | Role |
|---|---|
| `SqueekSwapV2` | Stores offer hashes/status and executes atomic ERC-721 transfers |
| Collection registry | Determines which ERC-721 contracts may appear in new or filled offers |
| Next.js web app | Builds Genesis offers, reads ownership/metadata, and submits wallet-signed calls |
| Read-only APIs | Reconstruct offers and proxy bounded collection/NFT/RPC reads |
| Squeek API integration | Provides optimized Genesis artwork and custody details only |

## Launch web data path

1. `/new` renders without connecting a wallet.
2. One `/api/genesis?ids=...` request batches owner and level reads for the featured shelf.
3. Card JSON contains small same-origin artwork paths, never embedded base64 artwork.
4. Browser-native lazy loading requests `/api/squeeks/[id]/image` only as artwork nears the viewport.
5. Artwork responses are cached for one day in browsers and shared caches, then served stale for up to a week while revalidating.
6. Connected-wallet and pasted-holder discovery read Squeekchain's account API from the visitor's browser (the API allows any origin but bot-challenges cloud servers), after a contract-graph check: the app compares `deployment.components` from `/v1/economy/state` with the addresses built into it and refuses to load holdings on any mismatch.

## Rendering performance

Genesis art is a ~56 KB SVG with over 1,100 `<use>` elements. Painting that vector in every card caused the scroll and selection lag, so `/api/squeeks/[id]/image` renders it once with sharp into a ~20 KB 384 px WebP (cached in memory and for a day in HTTP caches; `?full=1` returns the SVG). Artwork URLs carry `v=` (format version) and `l=` (level) so browsers refetch when either changes.

- Wallet and holder grids render 24 cards at a time with "Show more"; cards come straight from the holdings list (level and custody included), so browsing costs no extra chain reads.
- Holdings load progressively: the first 100 tokens in one request, the rest in the background, with a 30 s shared server cache per wallet.
- Genesis details are cached per token and batched per tick, so selecting a card never refetches cards already loaded.
- `SqueekCard` is memoized; a click re-renders only the card that changed.
- After a transaction only the affected queries refresh.

Measured on the production build with a 1,035-token holder: click-to-paint fell from 520–2,856 ms to 24–40 ms, the worst scroll frame from 450–1,200 ms to 17 ms (0 of 301 frames over 50 ms), and first holder cards from 14.5 s to 1.5 s.

The measured featured-shelf path fell from four roughly 73 KB JSON responses taking 1.7-1.8 seconds each to one roughly 1 KB batch response measured at 463 ms. Network conditions vary, so these numbers are recorded as a local production-build benchmark, not a universal guarantee.

## Offer lifecycle

1. The maker selects exact assets as `{collection, tokenId}`.
2. The client confirms ownership and a single current owner for all wanted assets.
3. The maker grants one approval per offered token.
4. `create` validates registry support, offered-NFT ownership, expiry, nonce, uniqueness, and a single current owner for wanted NFTs (approvals are not checked here); it stores a hash and emits the full offer.
5. The taker grants one approval per requested token.
6. `fill` revalidates both sides, marks the offer filled, transfers both bundles, then asserts final ownership.
7. Any failed check or transfer reverts every state and NFT movement.

Offers may be closed individually with `cancel`, invalidated in bulk with `revokeAll`, or closed after expiry with `reclaim`.

## Registry

The registry is intentionally narrow governance. The admin can enable/disable collections and transfer the registry-admin role through a two-step process. The admin cannot alter offer hashes, transfer user assets, upgrade code, pause arbitrary wallets, or introduce a fee.

The contract accepts any admitted collection. The current public web flow deliberately exposes only the canonical Squeek Genesis contract. This prevents confusion between similarly named collections while preserving multi-collection support for a later, reviewed UI expansion.

## Metadata boundary

Ownership and authorization come only from chain reads and contract checks. Metadata is untrusted presentation data. The Genesis shelf reads ownership and levels in one cached batch, then loads artwork separately through a lazy same-origin image route. Generic metadata support remains bounded to allowlisted HTTPS/IPFS/Arweave gateways. Active SVG data URLs and arbitrary URLs are rejected. The RPC gateway allows read/simulation methods only and rejects raw transaction submission.
