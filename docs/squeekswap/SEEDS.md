# Seeds 🌻

Seeds are SqueekSwap's points for completed official Squeek Genesis swaps. They are computed offchain from
public chain data only, so anyone can recompute them. Seeds are not Squeekchain Aura and are not tied to the
Genesis whitelist. The rules live in `web/lib/seeds.ts` (constants in `SEEDS`) and are covered by
`web/tests/seeds.test.ts`.

## Rules (v1)

| Rule | Value |
|---|---|
| Seeds per scored swap, for each wallet | 10 |
| Bundle bonus | +2 per NFT beyond the first two, both sides counted |
| Zoomies | x2 when Squeektoshi ran during the swap's SqueekCore round |
| Daily cap | 3 scored swaps per wallet per UTC day |
| Pair rule | one scored swap per wallet pair per UTC day |
| NFT cooldown | each NFT earns at most once every 3 days, whoever holds it |

A swap scores if at least one of its NFTs is off cooldown; the bundle bonus counts only those NFTs. A swap
that pays nothing does not start any cooldown. 1-for-1 = 10 Seeds, 8-for-8 = 38, doubled with Zoomies.

## Data sources

- Swaps: `OfferFilled` on SqueekSwap V2 `0x28eb722a6abbaf3A69BE0FCC6E026b9D0cEFfBF5`, with the fill block's
  timestamp. Only offers whose every asset is official Genesis count.
- Zoomies: SqueekCore `0xfd6c166d4b8e2962e65746a13e5a0797cd4de0c4`. Rounds are 600 s from genesis timestamp
  `1793735400`. `RoundRecorded(roundId, work, ...)` is emitted only for rounds where the hamster ran;
  `BatchSettled(settledThroughRound)` marks rounds final. A swap in an unsettled round shows Zoomies pending
  and earns the base amount until the round settles.
- The live "Squeektoshi is running" badge is a hint only; the bonus is decided onchain.

## APIs

- `GET /api/seeds?chainId=11155111[&wallet=0x…]` — rules, leaderboard (top 100), and one wallet's detail.
- The live wheel badge reads `api.squeekchain.com/v1/status` from the visitor's browser every 15 s.

## Known limits

- A person with many wallets and many NFTs can still earn more; the caps bound earnings by real NFTs held.
- Rule changes recompute all history, because scores are derived, not stored.
