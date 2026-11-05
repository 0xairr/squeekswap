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

/** A wallet as the viewer reads it: "You" for their own address, otherwise the short form. */
export function who(address: string, viewer: string | null | undefined): string {
  return same(address, viewer) ? 'You' : shortAddress(address)
}

/** "#19 for #20", or "3 Squeeks for 2" once a side holds more than one. */
export function tradeTitle(give: readonly { tokenId: bigint }[], want: readonly { tokenId: bigint }[]): string {
  if (give.length === 1 && want.length === 1) return `#${give[0].tokenId} for #${want[0].tokenId}`
  const side = (n: number) => (n === 1 ? '1 Squeek' : `${n} Squeeks`)
  return `${side(give.length)} for ${want.length}`
}

const UNITS: [number, string][] = [[86400, 'day'], [3600, 'hour'], [60, 'minute']]

function span(seconds: number): string {
  for (const [size, unit] of UNITS) {
    const n = Math.floor(seconds / size)
    if (n >= 1) return `${n} ${unit}${n === 1 ? '' : 's'}`
  }
  return 'less than a minute'
}

/** "3 hours ago" for a past unix time. */
export function timeAgo(unixSeconds: number, nowSeconds: number): string {
  const passed = nowSeconds - unixSeconds
  return passed < 60 ? 'just now' : `${span(passed)} ago`
}

/** "6 days left" until a unix expiry, or "Expired". */
export function timeLeft(expirySeconds: number, nowSeconds: number): string {
  const left = expirySeconds - nowSeconds
  return left <= 0 ? 'Expired' : `${span(left)} left`
}
