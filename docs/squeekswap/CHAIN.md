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
| Official Squeek Genesis (Squeekchain identity graph `genesis`) | `0xCB98349c134aB983dA5BfD80527dfe2552bDB70F` | Supported |
| Lookalike: reports `name()="Squeek"`, `symbol()="SQUEEK"`, not in the identity graph | `0x0eAF3E0d40A0a8E5a6Ac030b2459E9FB0B7905c6` | Disabled 2026-11-04 |

Both addresses passed deployed-code and ERC-165 ERC-721 checks during deployment. Because both report the same name and symbol, the second one was a lookalike-swap risk and was disabled before any V2 offer existed. Do not infer current contract support from this document alone; `supportedCollection(address)` on V2 is authoritative because the admin may disable a collection.

The public website currently builds offers only for the official Genesis address. Genesis has the optimized artwork, level, staking-custody, search, and holder-discovery integration. The web app flags any non-Genesis asset in an offer and refuses to accept it, even if a collection is admitted later.
