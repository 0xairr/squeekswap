import { getAddress, isAddress } from 'viem'
import { overLimit, PUBLIC_HEADERS } from '@/lib/api'
import { swapAbi } from '@/lib/abis'
import { deploymentFor, SQUEEK_CHAIN_ID } from '@/lib/deployments'
import { readNft } from '@/lib/nfts'
import { serverClient } from '@/lib/server'

export async function GET(request: Request, { params }: { params: Promise<{ collection: string; id: string }> }) {
  const limited = overLimit(request)
  if (limited) return limited
  const { collection: rawCollection, id } = await params
  if (!isAddress(rawCollection) || !/^\d{1,78}$/.test(id)) return Response.json({ error: 'Invalid NFT.' }, { status: 400 })
  const tokenId = BigInt(id)
  if (tokenId >= 2n ** 256n) return Response.json({ error: 'Invalid token ID.' }, { status: 400 })
  const chainId = Number(new URL(request.url).searchParams.get('chainId') || SQUEEK_CHAIN_ID)
  const deployment = deploymentFor(chainId)
  const client = serverClient(chainId)
  if (!deployment || !client) return Response.json({ error: 'Unsupported chain.' }, { status: 400 })
  const collection = getAddress(rawCollection)
  try {
    const supported = await client.readContract({ address: deployment.swap, abi: swapAbi, functionName: 'supportedCollection', args: [collection] })
    if (!supported) return Response.json({ error: 'Collection is not supported.' }, { status: 404 })
    const nft = await readNft(client, deployment, { collection, tokenId })
    return Response.json({ ...nft, tokenId: nft.tokenId.toString() }, { headers: PUBLIC_HEADERS })
  } catch {
    return Response.json({ error: 'Could not read this NFT.' }, { status: 502 })
  }
}
