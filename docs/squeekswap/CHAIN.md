# Chain and collection identities

Squeekchain currently uses Ethereum Sepolia (`11155111`) for its public testnet contracts. SqueekSwap V2 is therefore a Sepolia contract; it is not a separate L1 or custom RPC network.

## SqueekSwap V2

| Item | Value |
|---|---|
| Contract | `0x28eb722a6abbaf3A69BE0FCC6E026b9D0cEFfBF5` |
| Deployment block | `12056300` |

## Deprecated V1

SqueekSwap V1 `0xDd9DE2450e5d2Cebab6cc5A6b6C0930D6e799B72` is verified but deprecated. It is ownerless and cannot be disabled, and it accepts collection-wide `setApprovalForAll`, unlike V2. It has no offers and no Genesis approvals; the website never uses it. Do not approve it.

## Contract registry

| Collection | Address | Status |
|---|---|---|
| Official Squeek Genesis (Squeekchain installation `sepolia-core-sepolia-20261103`) | `0xc4c7982657f00509548f3a3a41db7fa439a6856b` | Supported 2026-11-05 |
| Retired Squeek Genesis from Squeekchain's first installation (same name/symbol, no longer tracked by Squeekchain) | `0xCB98349c134aB983dA5BfD80527dfe2552bDB70F` | Disabled 2026-11-05 |
| Lookalike: reports `name()="Squeek"`, `symbol()="SQUEEK"`, not in the identity graph | `0x0eAF3E0d40A0a8E5a6Ac030b2459E9FB0B7905c6` | Disabled 2026-11-04 |

Squeekchain relaunched on 2026-11-03 with new contracts for every component, including a new Genesis collection. Every collection in this table reports `name()="Squeek"` and `symbol()="SQUEEK"`, so only the current official one stays enabled; the others were disabled before any V2 offer existed. Do not infer current contract support from this document alone; `supportedCollection(address)` on V2 is authoritative because the admin may disable a collection.

The public website currently builds offers only for the official Genesis address. Genesis has the optimized artwork, level, staking-custody, search, and holder-discovery integration. The web app flags any non-Genesis asset in an offer and refuses to accept it, even if a collection is admitted later.
