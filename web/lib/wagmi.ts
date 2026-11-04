import { createConfig, http } from 'wagmi'
import { foundry, sepolia } from 'wagmi/chains'
import { injected, walletConnect } from 'wagmi/connectors'
import { localEnabled } from './deployments'

export { localEnabled }

// Browser reads use the same-origin, read-only RPC gateway. This avoids leaking a provider key and
// avoids third-party CORS failures; the gateway rejects signing and raw-transaction methods.
const transports = {
  [sepolia.id]: http('/api/rpc'),
}

/**
 * WalletConnect (Reown Cloud) project ID. Public by design: it ships in every page. The domains allowed to use
 * it are set in cloud.reown.com, so squeekswap.xyz must be on that project's allowlist.
 */
export const WALLETCONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '43632658159527dd4719870ed415d81b'

// Installed browser wallets (MetaMask, Rabby, Coinbase…) are discovered automatically through EIP-6963 and
// listed by name; `injected()` is the generic fallback.
const connectors = [injected()]

/**
 * WalletConnect for phone wallets, with its official QR modal. It is created only when someone picks it: a
 * connector in the config is set up at startup, which downloads ~100 KB and calls Reown on every page load.
 */
export function walletConnectConnector() {
  return walletConnect({
    projectId: WALLETCONNECT_PROJECT_ID,
    showQrModal: true,
    metadata: {
      name: 'SqueekSwap',
      description: 'Trade Squeek Genesis NFTs with other holders in one transaction.',
      url: 'https://www.squeekswap.xyz',
      icons: ['https://www.squeekswap.xyz/icon.svg'],
    },
  })
}

// The local chain is compiled in only when switched on, so a production build never calls 127.0.0.1.
export const config = localEnabled
  ? createConfig({ chains: [sepolia, foundry], connectors, transports: { ...transports, [foundry.id]: http('http://127.0.0.1:8545') }, ssr: false })
  : createConfig({ chains: [sepolia], connectors, transports, ssr: false })

export type AppConfig = typeof config
export type ChainId = AppConfig['chains'][number]['id']

export function asChainId(id: number): ChainId | null {
  return config.chains.some((c) => c.id === id) ? (id as ChainId) : null
}

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}
