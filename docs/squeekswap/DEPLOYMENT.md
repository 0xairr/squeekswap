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
- No environment variables are required; `web/.env.example` lists the optional ones
- Squeekchain's public API rejects requests from cloud servers, so the server reads Genesis artwork from the onchain `tokenURI`, and the browser reads holdings and wheel status from the API directly (it allows any origin)

## Checks

```bash
cd web && npm test && npm run typecheck && npm run build
cd contracts && forge test -vv
SQUEEK_FORK=1 forge test --match-contract Fork
```
