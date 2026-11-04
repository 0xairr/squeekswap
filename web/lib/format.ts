export function shortAddress(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

export function same(a?: string | null, b?: string | null): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase()
}

export function parseIds(text: string): bigint[] {
  const out: bigint[] = []
  for (const m of text.matchAll(/(?<![\w-])#?(\d{1,7})(?!\w)/g)) {
    const id = BigInt(m[1])
    if (id > 0n && !out.includes(id)) out.push(id)
  }
  return out
}

const NAMES: Record<number, string> = { 1: 'Ethereum', 11155111: 'Sepolia', 31337: 'Local' }

export function networkName(chainId: number): string {
  return NAMES[chainId] ?? `Chain ${chainId}`
}

export function chainMismatch(walletChainId: number | undefined, offerChainId: number): boolean {
  return walletChainId !== undefined && walletChainId !== offerChainId
}

export function parseOfferParams(chainId: string, id: string): { chainId: number; id: bigint } | null {
  if (!/^\d+$/.test(chainId) || !/^\d+$/.test(id)) return null
  const parsed = { chainId: Number(chainId), id: BigInt(id) }
  return parsed.id > 0n ? parsed : null
}

const EXPLORERS: Record<number, string> = { 1: 'https://etherscan.io', 11155111: 'https://sepolia.etherscan.io' }

export function txUrl(chainId: number, hash: string): string | null {
  const base = EXPLORERS[chainId]
  return base ? `${base}/tx/${hash}` : null
}

export function addressUrl(chainId: number, address: string): string | null {
  const base = EXPLORERS[chainId]
  return base ? `${base}/address/${address}` : null
}

export function isTestNetwork(chainId: number): boolean {
  return chainId !== 1
}

const ANYONE = '0x0000000000000000000000000000000000000000'

/** Offer sides named for whoever is looking: the maker, a wallet that may accept, or anyone else. */
export function sideLabels(viewer: string | null | undefined, maker: string, taker: string): { give: string; want: string } {
  if (same(viewer, maker)) return { give: 'You give', want: 'You get' }
  if (viewer && (same(taker, ANYONE) || same(viewer, taker))) return { give: 'You get', want: 'You give' }
  return { give: 'Maker gives', want: 'Maker wants' }
}
