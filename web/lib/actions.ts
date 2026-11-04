import { simulateContract, writeContract } from 'wagmi/actions'
import { zeroAddress, type Hex } from 'viem'
import { erc721Abi, swapAbi } from './abis'
import type { Deployment } from './deployments'
import type { Asset, Offer } from './offers'
import type { AppConfig, ChainId } from './wagmi'

export async function approveNft(config: AppConfig, chainId: ChainId, dep: Deployment, asset: Asset): Promise<Hex> {
  const { request } = await simulateContract(config, { chainId, address: asset.collection, abi: erc721Abi, functionName: 'approve', args: [dep.swap, asset.tokenId] })
  return writeContract(config, request)
}
export async function revokeNft(config: AppConfig, chainId: ChainId, asset: Asset): Promise<Hex> {
  const { request } = await simulateContract(config, { chainId, address: asset.collection, abi: erc721Abi, functionName: 'approve', args: [zeroAddress, asset.tokenId] })
  return writeContract(config, request)
}
export async function revokeCollectionApproval(config: AppConfig, chainId: ChainId, dep: Deployment, collection: Asset['collection']): Promise<Hex> {
  const { request } = await simulateContract(config, { chainId, address: collection, abi: erc721Abi, functionName: 'setApprovalForAll', args: [dep.swap, false] })
  return writeContract(config, request)
}
export async function createOffer(config: AppConfig, chainId: ChainId, dep: Deployment, offer: Offer): Promise<Hex> {
  const { request } = await simulateContract(config, { chainId, address: dep.swap, abi: swapAbi, functionName: 'create', args: [offer] })
  return writeContract(config, request)
}
export async function fillOffer(config: AppConfig, chainId: ChainId, dep: Deployment, id: bigint, offer: Offer): Promise<Hex> {
  const { request } = await simulateContract(config, { chainId, address: dep.swap, abi: swapAbi, functionName: 'fill', args: [id, offer] })
  return writeContract(config, request)
}
export async function cancelOffer(config: AppConfig, chainId: ChainId, dep: Deployment, id: bigint): Promise<Hex> {
  const { request } = await simulateContract(config, { chainId, address: dep.swap, abi: swapAbi, functionName: 'cancel', args: [id] })
  return writeContract(config, request)
}
export async function reclaimOffer(config: AppConfig, chainId: ChainId, dep: Deployment, id: bigint): Promise<Hex> {
  const { request } = await simulateContract(config, { chainId, address: dep.swap, abi: swapAbi, functionName: 'reclaim', args: [id] })
  return writeContract(config, request)
}
export async function revokeAllOffers(config: AppConfig, chainId: ChainId, dep: Deployment): Promise<Hex> {
  const { request } = await simulateContract(config, { chainId, address: dep.swap, abi: swapAbi, functionName: 'revokeAll' })
  return writeContract(config, request)
}
