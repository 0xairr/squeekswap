import { deploymentFor, SQUEEK_CHAIN_ID } from '@/lib/deployments'

const GUIDE = `# SqueekSwap

> Atomic, non-custodial ERC-721 barter on Ethereum Sepolia for Squeekchain collections.

SqueekSwap never holds keys, NFTs, or ETH. It has no proxy, upgrade path, or platform fee. A narrow registry admin can enable or disable ERC-721 collections but cannot move user assets.

The deployed contract is multi-collection capable. The launch website intentionally creates offers only for the official Squeek Genesis collection at 0xc4c7982657f00509548f3a3a41db7fa439a6856b, which is also the only collection currently supported by the registry. Offers containing any other contract are refused by the website.

## Links

- [Website](https://www.squeekswap.xyz): make and accept Genesis swaps
- [Desk API](https://www.squeekswap.xyz/api/desk): current address, ABI, deployment block and check() reasons
- [Offers API](https://www.squeekswap.xyz/api/offers?chainId=11155111): every offer reconstructed from contract events
- [Seeds API](https://www.squeekswap.xyz/api/seeds?chainId=11155111): Seeds leaderboard and rules
- [Verified contract](https://sepolia.etherscan.io/address/0x28eb722a6abbaf3A69BE0FCC6E026b9D0cEFfBF5#code): SqueekSwapV2 source on Sepolia Etherscan
- [Squeek Genesis](https://sepolia.etherscan.io/address/0xc4c7982657f00509548f3a3a41db7fa439a6856b): the only collection the website supports

## Deployment

DEPLOYMENT

- Explorer: https://eth-sepolia.blockscout.com/address/0x28eb722a6abbaf3A69BE0FCC6E026b9D0cEFfBF5

GET /api/desk for the current address, ABI, block, and check() reason table. Read collectionCount() and collectionAt(index) onchain for current collection support.

GET /api/genesis?chainId=11155111&ids=420,42 for batched official Genesis ownership and level data. Artwork is returned as a lazy same-origin image path rather than embedded base64 data.

## Asset and offer shapes

An asset is { collection, tokenId }. An offer is { maker, taker, expiry, nonce, give, want }, where give and want are arrays of 1–8 exact assets. Large integers are decimal strings in API JSON.

## Accept an offer

1. Load the offer and confirm it is open.
2. Inspect every exact collection address and token ID.
3. Call approve(swap, tokenId) on each wanted NFT collection. Global operator approval is intentionally not accepted.
4. Call check(id, offer, yourAddress). Continue only when it returns 0.
5. Call fill(id, offer). Both bundles move atomically.

## Make an offer

1. Read nonceOf(maker).
2. Build the exact offer tuple. All wanted NFTs must currently belong to one wallet. Use zero-address taker for public acceptance or that current owner for a targeted offer.
3. Grant one token-specific approval for every give asset. create() does not check approvals, but fill() does, so an unapproved offer cannot be accepted.
4. Call create(offer). OfferCreated contains the ID and complete body; keccak256(abi.encode(offer)) equals records(id).hash.

## Close offers

- cancel(id): maker closes one offer.
- revokeAll(): maker invalidates all offers with an older nonce.
- reclaim(id): anyone closes an expired record.

## Safety

- supportedCollection, ownership, and approvals are rechecked during fill.
- Metadata and the read API are display/index data, never authorization sources.
- A staked Squeek must be withdrawn before its owner can transfer it.
- Cancel offers you no longer intend even though token-specific approval prevents silent revival after a normal ERC-721 transfer.
`

function deploymentText() {
  const deployment = deploymentFor(SQUEEK_CHAIN_ID)
  if (!deployment) return '- V2 deployment unavailable in this build.'
  return `- Chain 11155111: SqueekSwapV2 ${deployment.swap}; indexed from block ${deployment.fromBlock}.`
}

export function GET() {
  return new Response(GUIDE.replace('DEPLOYMENT', deploymentText()), { headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Access-Control-Allow-Origin': '*' } })
}
