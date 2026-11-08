# SqueekSwap Vault: design

Status: approved for build by the owner on 2026-11-08 ("design, check for loopholes, then build"). Testnet (Sepolia) only. Coin name chosen by the owner: **Squeek Cheeks (CHEEKS)**.

## Intent

Turn Squeek Genesis NFTs into fungible coins. Locking a Squeek mints coins equal to its power; the vault stakes the Squeek in Squeekchain so it keeps earning SQK; coin holders receive that SQK. Burning coins takes any Squeek out of the vault. The coin lets people own part of a Squeek, trade it in a pool, and earn the Squeek's real yield.

Why it beats the alternatives:
- Clutch's Anvil (Robinhood Chain) wraps NFTs at a fixed ratio, but the NFTs sit idle and the only yield is 5-15% swap fees paid to people who stake NFTs. Here the NFTs earn native SQK the whole time and holding the coin earns it.
- SQUEEKSTR uses receipt NFTs and only its owner can withdraw. Here anyone with the coins can take a Squeek out at any time.
- Pooling many Squeeks in one Squeekchain account makes re-staked SQK far more powerful (see House stake), which no single holder can do.

## Goals

1. Lock: Squeek in, coins out (coins = base power x 1e18), Squeek staked in Squeekchain in the same transaction.
2. Unlock: burn a Squeek's coins (plus the unlock fee, 0 at launch), get that exact Squeek back, instantly.
3. Every wallet holding coins earns SQK every second it holds them, pro rata. No staking step. Claim any time.
4. 25% of the vault's SQK is re-staked forever as the house stake, raising the vault's power.
5. An official Uniswap V2 coin/WETH pool that the vault creates at deploy and excludes from earning.
6. SqueekSwap site gets a Vault page: lock, unlock, claim, live stats.

## Non-goals

- No loans (Burrow already does SQK loans against Squeeks).
- No merges inside the vault.
- No buy/sell tax on the coin. Transfers move exact amounts.
- No staking of the coin, no LP rewards, no V4 hook (possible later as separate contracts).
- No changes to SqueekSwap V2.
- No mainnet deploy.

## Anti-goals (would be failure even if it works)

- Any way for anyone, including the owner, to take Squeeks, coins or SQK that are not theirs.
- Coin supply drifting away from the vault's locked power.
- A holder earning SQK for time they did not hold coins.
- Unlocking ever blocked by a setting someone can flip.
- Marketing copy that reads as an official Squeekchain token.

## Facts it rests on (checked 2026-11-08 against verified Squeekchain source)

- SqueekStaking proxy `0x50fd1780526c3186a0c037c7622203bc4fb611ca`, implementation `0xF7027f97…4eA92` (Sourcify exact match). Genesis `0xc4c7982657f00509548f3a3a41db7fa439a6856b`, SQK `0xd78a3956cf63164d1fa1c622ad3c66623162fa1e`.
- `deposit(collection, ids)` pulls with `transferFrom(msg.sender, staking, id)`; the vault must approve Staking on Genesis. Max 100 ids. Reverts while intake is paused.
- `withdraw(collection, ids)` returns with plain `transferFrom` (no receiver callback), is free, has no cooldown and works while paused. Only the depositor can withdraw.
- `claim(account)` must be sent by the claim recipient (default: the account), pays all of `claimable(account)`, returns the amount, returns 0 when nothing is owed.
- `claimable(account)` is a view projected to the current second.
- `stake(amount)` pulls exactly `amount` SQK; reverts while paused; unstaking costs a 2-60% burned exit fee. The vault never unstakes.
- `basePower(collection, level)`: L1 1,000, L2 2,200, … L10 1,207,269. A Squeek's level can only change through `mergeDeposited`, which only its depositor can call.
- Staked SQK power `Q = S x (1000 + P) / (40 x 1000)` with P = the account's Squeek power. With 20 L1s, 1,000 SQK gives the vault 525 power; a 1-Squeek holder gets 50.
- Rewards stream: each funded Squeek block is released linearly over 1,200 seconds (`SqueekStakingLogic.previewRewards`); funding releases nothing at once. So `claimable(vault)` rises smoothly, never jumps, and only falls when the vault claims. The read is constant-time (no loops): about 3,300 gas measured on a fork.
- "Fresh" SQK only matters for when principal can be unstaked; it never delays earning (Squeekchain source: "determines only principal maturity, never reward timing"). New deposits earn from the same transaction.
- Squeekchain staking uses Cancun opcodes (transient storage): fork tests must run with `--evm-version cancun`.
- Uniswap V2 on Sepolia: factory `0xF62c03E08ada871A0bEb309762E260a7a6a880E6`, router `0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3`, WETH `0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14`. V4 PoolManager `0xE03A1074c86CFeDd5C142C4F04F1a1536e203543`.

## How it works

One contract, `SqueekVault`: it is the ERC-20 coin and the vault.

### Lock

- `lock(ids)`: caller has approved the vault (per token or for all). For each id the vault pulls the Squeek, reads `level(id)` and `basePower(genesis, level)`, records `{lockedBy: caller, power}`, then calls `staking.deposit(genesis, ids)` once and mints `Σ power x 1e18` coins to the caller.
- One-Squeek shortcut: `Genesis.safeTransferFrom(owner, vault, id)` locks it in one transaction with no approval. Coins go to `from` (the previous owner), never to the operator.
- Rejects: other collections, empty or >100 batches, Squeekchain intake paused (Squeekchain reverts).

### Unlock

- `unlock(ids)`: for each id it must be locked; total coins = `Σ stored power x 1e18`; fee = `coins x fee / 10,000` unless the caller is the wallet that locked that Squeek. Burns the coins, moves the fee coins to holders, `staking.withdraw(genesis, ids)`, then `safeTransferFrom` each Squeek to the caller.
- The stored power is burned, not a fresh `basePower` read, so a Squeekchain upgrade cannot break supply = power.

### Earning (exact, per second)

Let `A(t) = harvested + staking.claimable(vault)`: everything the vault has earned so far.

Checkpoint (runs before every mint, burn and transfer, and in claim/harvest):
1. Read `claimable(vault)` with a capped-gas static call. If the call fails, skip this checkpoint and remember the miss; the SQK earned across a missed read goes entirely to the house at the next good read, so nobody can buy in during an outage and collect it. The caller must supply enough gas for the read, or the transaction reverts, so nobody can force a miss.
2. `Δ = A(now) - A(last)`. If 0, stop.
3. If any coins are earning: 75% of Δ goes to holders (`rewardPerCoin += 0.75Δ / earningSupply`, remainder carried so nothing is lost to rounding), 25% to `houseOwed`. If no coins are earning, all of Δ goes to `houseOwed`.

`earningSupply = totalSupply - balance(pair) - balance(V4 PoolManager) - balance(vault)`.

Each wallet's balance is settled against `rewardPerCoin` before its balance changes, so earnings follow whoever held the coins at each moment. Excluded addresses never accrue.

### Harvest and house stake

`harvest()` (public; also run by `claim`): checkpoint, `staking.claim(vault)`, then stake `min(houseOwed, SQK balance - SQK owed to holders)` into Squeekchain. If staking reverts (intake paused), the house amount waits for the next harvest. House SQK never comes out.

### Claim

`claim()`: harvest, settle the caller, send their SQK and any fee coins. If Squeekchain claim failed, pay what the vault holds and keep the rest owed. Holders are always paid before the house is staked.

### Unlock fee (owner's only power)

- Starts at 0. Owner can schedule a new fee up to 5% (500 bps); it takes effect 3 days later, so holders see it coming and can leave first.
- Never charged when you take back a Squeek you locked yourself.
- Fee coins go to coin holders (second accumulator, claimed with SQK). If no coin is earning at that moment, no fee is charged.
- `Ownable2Step`; ownership can be renounced. The owner cannot touch NFTs, coins, SQK, the house share, the pool or exclusions.

### Pool

- Constructor: computes the pair's CREATE2 address from the V2 factory, the sorted token pair and Uniswap's pair init-code hash (`0x96e8…845f`, checked against an existing Sepolia pair). It does not create the pair: Sepolia's state pricing (about 1,540 gas per byte of new code, 210k per new contract, 111k per new storage slot, measured 2026-11-08) made vault + pair a ~37M-gas deploy. Whoever creates the pair later (usually the first add-liquidity), it lands at that address. That address and the V4 PoolManager are excluded from earning forever.
- The vault is deployed through the standard CREATE2 deployer (`0x4e59…956C`) with a mined salt so its address starts `0xC4EEC5` ("cheeks" in hex).
- After deploy, a script locks the owner's Squeek, adds coins + Sepolia ETH through the V2 router and sends the LP tokens to `0x000000000000000000000000000000000000dEaD`.
- Arbitrage keeps 1,000 coins ≈ one L1 Squeek: buy cheap coins and unlock, or lock and sell expensive coins.

## Loophole review

| Risk | Answer |
|---|---|
| Buy coins just before a payout, sell right after | Earnings are counted per second via the checkpoint on every transfer; a buyer earns only from the second they hold. Same-block in/out earns 0. |
| Lock briefly to grab others' pending SQK | Same: the checkpoint at mint attributes all accrual up to that second to existing holders. |
| Flash-borrow coins from the pool | Coins held for 0 seconds earn 0. |
| Pool or other contracts trapping SQK | Official pair and V4 PoolManager are excluded; their share goes to holders. Coins in any other contract earn SQK nobody can claim (documented). |
| Force a skipped checkpoint by low gas | The vault reverts unless enough gas is left for the read. |
| Merge two L1s in the vault for free power | The vault never calls `mergeDeposited`; nobody else can. Level is frozen while locked. |
| Squeekchain changes `basePower` | Unlock burns the stored power for that token. |
| Reentrancy through NFT callbacks | `nonReentrant` on every entry; state written before outside calls; Squeekchain withdraw has no callback. |
| Stray NFTs from other collections | `onERC721Received` rejects anything but Genesis. |
| Squeek sent with plain `transferFrom` | Stuck (no callback, no coins). The site never does this. |
| Coins sent to the vault address | `transfer`/`transferFrom` to the vault revert. |
| Pair front-run before deploy | `getPair` first, `createPair` only if missing. |
| Squeekchain intake paused | Lock reverts with Squeekchain's error; unlock and claim keep working; house stake retries later. |
| Squeekchain claim breaks | Claim pays from what the vault holds; the rest stays owed. |
| Owner raises the fee to trap holders | Hard cap 5%, 3-day delay, own Squeek always free, fee goes to holders not the owner. |
| No earners at all | Accrual goes to the house; no lump for the next newcomer. |
| Rounding | Floors everywhere; remainders carried; Σ owed never exceeds allocated. |
| Squeekchain relaunch | This vault stays bound to the current contracts; unlock works while their `withdraw` does. A relaunch needs a new vault. |
| Squeekchain upgrades Staking maliciously | Inherent to any staker; same trust as staking directly. |
| Sandwich on a large unlock fee | Only possible once the fee is above 0; bounded by the fee size. Documented. |
| Flash-borrow coins to take back most of your own unlock fee | Real: fee coins go to whoever holds earning coins at that moment, including borrowed ones (found in code review). The owner accepted it because the fee is 0 and stays 0 for now; a real fee would need a vault that streams fee coins over time. |
| Flash-swap coins out of the pool around a block completion | Funding releases nothing at once (1,200 s stream), and same-second holding earns 0. |
| Squeekchain read broken for a while, buy coins before it's fixed | SQK earned across a missed read goes to the house, not to whoever holds at the next good read. |
| Fee above 0 strands the last Squeeks | Supply always equals locked power, but taking someone else's Squeek costs power + fee, so the last few may need coins that don't exist. Taking back your own Squeek is always fee-free, and coins locked in the burned-LP pool strand a little power regardless. Accepted; the fee starts at 0. |
| Squeekchain gives stakers something besides SQK (badges, allowlists, snapshots) | Locked Squeeks show the vault as depositor, so such perks wouldn't reach the locker. `lockInfo` records who locked each Squeek, and unlocking your own is free and instant; the site warns lockers to unlock before any snapshot. |

## Invariants (tested)

1. `totalSupply == Σ stored power of locked Squeeks x 1e18`.
2. Every locked Squeek is deposited in Squeekchain with depositor = vault.
3. `Σ SQK paid to holders + Σ SQK owed ≤ SQK allocated to holders`.
4. `SQK balance + claimable(vault) ≥ SQK owed to holders + houseOwed` (up to rounding dust).
5. Vault coin balance `≥` fee coins owed.

## SqueekSwap integration

- New `/vault` page: stats (Squeeks locked, coins, house stake, power multiplier, SQK/day per 1,000 coins or "wheel idle"), your position (coins, claimable SQK and coins, Claim), Lock (your wallet's Squeeks, coins you'd get), Unlock (the vault's Squeeks, cost), Pool (Uniswap link, add coin and SQK to wallet).
- Header link "Vault". `/llms.txt`, deployments registry and docs updated.
- The vault lists its Squeeks onchain (`lockedIds`), so the page doesn't depend on Squeekchain's API for that.

## Left to the builder

- Contract layout, function names beyond those above, event shapes, gas cap for the claimable read (measure on a fork), page layout matching the existing SqueekSwap style.

## Calls made by the builder (owner to check)

- Name `SqueekSwap Vault Squeek`, symbol `vSQUEEK` (immutable; confirm before deploy).
- Fee cap 5%, delay 3 days, own-Squeek exemption.
- Fee coins to holders.
- Rewards per second instead of the earlier 24-hour release (removes the timing tricks).
- `harvest()` runs in `claim` and on demand, not in lock/unlock, to keep those cheap.
