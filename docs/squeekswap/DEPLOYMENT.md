# Deployment

## Contract

- Network: Ethereum Sepolia (`11155111`)
- SqueekSwap V2: `0x28eb722a6abbaf3A69BE0FCC6E026b9D0cEFfBF5`, deployed in block `12056300`
- Compiler: Solidity `0.8.28`, optimizer 200 runs, via IR, Shanghai EVM; runtime size 6,132 bytes
- `contracts/artifacts/SqueekSwapV2.json` is the exact build: its runtime bytecode equals the deployed code
- Source verified on Etherscan, Sourcify (exact match) and Blockscout

The registry supports only official Squeek Genesis. A lookalike contract that reports the same `Squeek`/`SQUEEK` name and symbol was admitted at deployment and disabled before any offer existed. Squeekchain relaunched on 2026-11-03 with a new Genesis collection (`0xc4c7982657f00509548f3a3a41db7fa439a6856b`); it was enabled and the retired first Genesis (`0xCB98349c134aB983dA5BfD80527dfe2552bDB70F`) disabled on 2026-11-05.

## Website

- Production: https://www.squeekswap.xyz, a Next.js app on Vercel (Node 24, root directory `web`)
- No environment variables are required; `web/.env.example` lists the optional ones. Server reads use publicnode and fall back to Tenderly's public gateway, because publicnode keeps only about 10,000 blocks of logs; a keyed archive RPC in `SEPOLIA_RPC_URL` is recommended
- Squeekchain's public API rejects requests from cloud servers, so the server reads Genesis artwork from the onchain `tokenURI`, and the browser reads holdings and wheel status from the API directly (it allows any origin)

## DNS and domain verification

- Nameservers: Vercel. The apex and the `*` wildcard are Vercel-managed ALIAS records.
- `www` has its own ALIAS to `cname.vercel-dns-017.com`. Keep it: any record under `www`, such as `_squeekchain.www`, makes `www` an existing name, and DNS wildcards never answer for existing names, so without it `www` stops resolving.
- `_squeekchain.www` TXT holds the Squeekchain project verification value. Squeekchain rechecks it daily; removing it removes The Buildooooor badge.
- The home page is rendered per request (`web/app/page.tsx` sets `dynamic = 'force-dynamic'`). A prerendered page answers byte-range requests with 206, and Squeekchain's page check needs a 200 that contains the `squeekchain-project` meta tag (set in `web/app/layout.tsx`).

## If Squeekchain relaunches

Squeekchain replaced all of its contracts once already (2026-11-03). On a relaunch, update `web/lib/deployments.ts`, `web/lib/deployments.json`, `ROUNDS.genesisTimestamp` in `web/lib/seeds.ts`, `ART_VERSION` in `web/lib/reads.ts`, `web/tests/squeekchain.test.ts` and the fork test from `/v1/economy/state` (`deployment.components`) and `/v1/core`, cross-check them onchain, and have the registry admin enable the new collection and disable the old one. Until then the site fails closed: holdings show an error instead of trusting unknown contracts.

## Checks

```bash
cd web && npm test && npm run typecheck && npm run build
cd contracts && forge test -vv
SQUEEK_FORK=1 forge test --match-contract Fork
```
