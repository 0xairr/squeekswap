import { overLimit } from '@/lib/api'
import { isCrossSite } from '@/lib/guard'

const MAX_BODY = 25_000
const MAX_RESPONSE = 2_000_000

const ALLOWED = new Set([
  'eth_blockNumber',
  'eth_call',
  'eth_chainId',
  'eth_estimateGas',
  'eth_feeHistory',
  'eth_gasPrice',
  'eth_getBalance',
  'eth_getBlockByNumber',
  'eth_getCode',
  'eth_getTransactionByHash',
  'eth_getTransactionCount',
  'eth_getTransactionReceipt',
  'eth_maxPriorityFeePerGas',
])

type RpcRequest = { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown }

function requests(value: unknown): RpcRequest[] | null {
  const items = Array.isArray(value) ? value : [value]
  if (items.length === 0 || items.length > 20) return null
  if (items.some((item) => !item || typeof item !== 'object')) return null
  return items as RpcRequest[]
}

export async function POST(request: Request) {
  // Only this site's own pages may use the gateway from a browser; it is not a public RPC.
  if (isCrossSite(request)) return Response.json({ error: 'Cross-site RPC use is not allowed.' }, { status: 403 })
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY) return Response.json({ error: 'RPC request too large.' }, { status: 413 })
  // The header is advisory (a chunked body has none), so the real size is checked after reading.
  const raw = await request.text()
  if (raw.length > MAX_BODY) return Response.json({ error: 'RPC request too large.' }, { status: 413 })

  let body: unknown
  try { body = JSON.parse(raw) } catch { return Response.json({ error: 'Invalid JSON.' }, { status: 400 }) }
  const calls = requests(body)
  if (!calls || calls.some((call) => call.jsonrpc !== '2.0' || typeof call.method !== 'string' || !ALLOWED.has(call.method))) {
    return Response.json({ error: 'Unsupported read method.' }, { status: 400 })
  }
  // A batch spends one unit per call, so batching cannot multiply a client's upstream budget.
  const limited = overLimit(request, 'rpc', calls.length)
  if (limited) return limited

  const upstream = process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com'
  try {
    const response = await fetch(upstream, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: raw,
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    })
    if (Number(response.headers.get('content-length') || 0) > MAX_RESPONSE) return Response.json({ error: 'RPC response too large.' }, { status: 502 })
    const text = await response.text()
    if (text.length > MAX_RESPONSE) return Response.json({ error: 'RPC response too large.' }, { status: 502 })
    return new Response(text, { status: response.ok ? 200 : 502, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
  } catch {
    return Response.json({ error: 'Sepolia RPC unavailable.' }, { status: 502 })
  }
}
