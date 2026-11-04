import { describe, expect, it } from 'vitest'
import { POST } from '@/app/api/rpc/route'

let client = 0
const call = (body: unknown, headers: Record<string, string> = {}) =>
  POST(new Request('https://swap.example/api/rpc', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': `198.51.100.${++client}`, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }))

describe('read-only RPC gateway', () => {
  it('refuses browser use from other sites', async () => {
    expect((await call({ jsonrpc: '2.0', id: 1, method: 'eth_chainId' }, { 'sec-fetch-site': 'cross-site' })).status).toBe(403)
  })
  it('refuses signing and raw-transaction methods, even inside a batch', async () => {
    expect((await call({ jsonrpc: '2.0', id: 1, method: 'eth_sendRawTransaction', params: ['0x00'] })).status).toBe(400)
    expect((await call([{ jsonrpc: '2.0', id: 1, method: 'eth_call' }, { jsonrpc: '2.0', id: 2, method: 'eth_sign' }])).status).toBe(400)
  })
  it('measures the real body, not the advisory header', async () => {
    const big = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: ['x'.repeat(30_000)] })
    expect((await call(big)).status).toBe(413)
  })
  it('caps batches at 20 calls', async () => {
    const batch = Array.from({ length: 21 }, (_, id) => ({ jsonrpc: '2.0', id, method: 'eth_chainId' }))
    expect((await call(batch)).status).toBe(400)
  })
})
