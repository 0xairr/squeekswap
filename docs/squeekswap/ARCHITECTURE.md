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
2. Browse Genesis lists the newest claimed Squeeks still held in a wallet: `/api/genesis/claimed` reads the test dispenser's onchain `Transfer` events, and one `/api/genesis?ids=...` request batches their owner and level reads. Squeeks still in the dispenser are marked unclaimed and cannot be selected.
3. Card JSON contains small same-origin artwork paths, never embedded base64 artwork.
4. Browser-native lazy loading requests `/api/squeeks/[id]/image` only as artwork nears the viewport.
5. Artwork responses are cached for one day in browsers and shared caches, then served stale for up to a week while revalidating.
6. Connected-wallet and pasted-holder discovery read Squeekchain's account API from the visitor's browser (the API allows any origin but bot-challenges cloud servers), after a contract-graph check: the app compares `deployment.components` from `/v1/economy/state` with the addresses built into it and refuses to load holdings on any mismatch. Squeekchain lists a change only after 12 confirmations, so the cards on screen are re-read onchain through `/api/genesis` and any that already left the wallet are hidden with a note.

## Server reads

Server routes read Sepolia through `SEPOLIA_RPC_URL` (default publicnode) and fall back to Tenderly's public gateway when a request is refused. publicnode keeps only about 10,000 blocks (~1.4 days) of logs, while the offer, wheel-round and claim readers scan from the V2 deployment block (`12056300`), so without the fallback a cold server could not rebuild history. `/api/genesis` is not cached by browsers and is kept at most 5 s at the CDN, so ownership is fresh right after a swap.

## Pages and wallet session

- Offer book (`/offers`): open offers, swap history (filled offers, newest first, timed by their `OfferFilled` block) and closed offers (cancelled, withdrawn, expired). Each row shows both sides' artwork.
- Offer page: one trade panel with both sides and the actions for the viewer's role, then the details.
- The wallet reconnects on page load; pressing Disconnect keeps it disconnected.
- The wallet, not the site, chooses which account connects. When it differs from the last account used in this browser, the header says so. On New offer an account switch clears the Squeeks picked to give, because they belong to the previous account.
- While a wallet request is open, the offer's selection is locked. Changing the offer after an approval is flagged and the approvals are re-checked; an approval left on a Squeek removed from the offer can be revoked from the page.

## Rendering performance

Genesis art is a ~56 KB SVG with over 1,100 `<use>` elements. Painting that vector in every card caused the scroll and selection lag, so `/api/squeeks/[id]/image` renders it once with sharp into a ~20 KB 384 px WebP (cached in memory and for a day in HTTP caches; `?full=1` returns the SVG). Artwork URLs carry `v=` (format version) and `l=` (level) so browsers refetch when either changes.

- Wallet and holder grids render 24 cards at a time with "Show more"; cards come straight from the holdings list (level and custody included), so browsing costs no extra chain reads.
- Holdings load progressively: the first 100 tokens in one request, the rest in the background, with a 30 s shared server cache per wallet.
- Genesis details are cached per token and batched per tick, so selecting a card never refetches cards already loaded.
- `SqueekCard` is memoized; a click re-renders only the card that changed.
- After a transaction only the affected queries refresh.

Measured on the production build with a 1,035-token holder: click-to-paint fell from 520–2,856 ms to 24–40 ms, the worst scroll frame from 450–1,200 ms to 17 ms (0 of 301 frames over 50 ms), and first holder cards from 14.5 s to 1.5 s.

The batched Genesis read replaced four roughly 73 KB JSON responses taking 1.7-1.8 seconds each with one roughly 1 KB response measured at 463 ms. Network conditions vary, so these numbers are recorded as a local production-build benchmark, not a universal guarantee.

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

Ownership and authorization come only from chain reads and contract checks. Metadata is untrusted presentation data. Genesis cards read ownership and levels in one short-lived batch, then load artwork separately through a lazy same-origin image route. Generic metadata support remains bounded to allowlisted HTTPS/IPFS/Arweave gateways. Active SVG data URLs and arbitrary URLs are rejected. The RPC gateway allows read/simulation methods only and rejects raw transaction submission.
