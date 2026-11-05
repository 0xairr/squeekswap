import { getAddress, type Address } from 'viem'
import { overLimit, PUBLIC_HEADERS } from '@/lib/api'
import { squeekAbi } from '@/lib/abis'
import { deploymentFor, SQUEEK_CHAIN_ID } from '@/lib/deployments'
import { genesisCustody } from '@/lib/nfts'
import { genesisImagePath, revertedAsNull } from '@/lib/reads'
import { serverClient } from '@/lib/server'

const MAX_IDS = 50

function parseIds(value: string | null): bigint[] | null {
  if (!value) return null
  const raw = value.split(',')
  if (raw.length > MAX_IDS || raw.some((id) => !/^\d{1,4}$/.test(id))) return null
  const ids = [...new Set(raw.map((id) => BigInt(id)))]
  return ids.length > 0 && ids.every((id) => id >= 1n && id <= 9999n) ? ids : null
}

export async function GET(request: Request) {
  const limited = overLimit(request)
  if (limited) return limited
  const url = new URL(request.url)
  const chainId = Number(url.searchParams.get('chainId') || SQUEEK_CHAIN_ID)
  const ids = parseIds(url.searchParams.get('ids'))
  const deployment = deploymentFor(chainId)
  const client = serverClient(chainId)
  if (!ids) return Response.json({ error: `Provide 1-${MAX_IDS} Genesis token IDs.` }, { status: 400 })
  if (!deployment || !client) return Response.json({ error: 'Unsupported chain.' }, { status: 400 })

  try {
    const rows = await Promise.all(ids.map(async (tokenId) => {
      // A revert means the token does not exist; an RPC failure fails the whole batch with a 502.
      const [rawOwner, rawLevel] = await Promise.all([
        revertedAsNull(client.readContract({ address: deployment.squeeks, abi: squeekAbi, functionName: 'ownerOf', args: [tokenId] })),
        revertedAsNull(client.readContract({ address: deployment.squeeks, abi: squeekAbi, functionName: 'level', args: [tokenId] })),
      ])
      const owner = rawOwner ? getAddress(rawOwner) as Address : null
      const level = rawLevel === null ? null : Number(rawLevel)
      return {
        collection: deployment.squeeks,
        tokenId: tokenId.toString(),
        owner,
        name: 'Squeek Genesis',
        symbol: 'SQUEEK',
        image: genesisImagePath(tokenId, level),
        custody: genesisCustody(owner, deployment),
        level,
        mergeState: null,
      }
    }))
    return Response.json(rows, {
      headers: { ...PUBLIC_HEADERS, 'Cache-Control': 'public, max-age=0, s-maxage=5' },
    })
  } catch {
    return Response.json({ error: 'Could not read the Genesis collection.' }, { status: 502 })
  }
}
