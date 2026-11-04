import { overLimit, PUBLIC_HEADERS } from '@/lib/api'
import { deploymentFor, SQUEEK_CHAIN_ID } from '@/lib/deployments'
import { readCollections } from '@/lib/nfts'
import { serverClient } from '@/lib/server'

export async function GET(request: Request) {
  const limited = overLimit(request)
  if (limited) return limited
  const chainId = Number(new URL(request.url).searchParams.get('chainId') || SQUEEK_CHAIN_ID)
  const deployment = deploymentFor(chainId)
  const client = serverClient(chainId)
  if (!deployment || !client) return Response.json({ error: 'Unsupported chain.' }, { status: 400 })
  try {
    return Response.json(await readCollections(client, deployment), { headers: PUBLIC_HEADERS })
  } catch {
    return Response.json({ error: 'Could not read the collection registry.' }, { status: 502 })
  }
}
