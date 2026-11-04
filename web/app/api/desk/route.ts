import { overLimit, PUBLIC_HEADERS } from '@/lib/api'
import { swapAbi } from '@/lib/abis'
import { deploymentFor, SQUEEK_CHAIN_ID } from '@/lib/deployments'
import { REASONS } from '@/lib/offers'

export async function GET(request: Request) {
  const limited = overLimit(request)
  if (limited) return limited
  const deployment = deploymentFor(SQUEEK_CHAIN_ID)
  return Response.json({
    name: 'SqueekSwap',
    guide: '/llms.txt',
    chainId: SQUEEK_CHAIN_ID,
    deployment: deployment ? {
      version: deployment.version,
      swap: deployment.swap,
      squeeks: deployment.squeeks,
      staking: deployment.staking,
      fromBlock: deployment.fromBlock.toString(),
      collections: 'Read collectionCount() and collectionAt(index) from the swap contract.',
      webScope: 'Official Squeek Genesis only.',
      genesisBatch: '/api/genesis?chainId=11155111&ids=420,42',
    } : null,
    reasons: REASONS,
    abi: swapAbi,
  }, { headers: PUBLIC_HEADERS })
}
