import { simulateContract, writeContract } from 'wagmi/actions'
import { zeroAddress, type Address, type Hex } from 'viem'
import { erc721Abi, genesisTransferAbi, swapAbi, vaultAbi } from './abis'
import type { Deployment, VaultDeployment } from './deployments'
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

// ---------------------------------------------------------------------------
// SqueekSwap Vault
// ---------------------------------------------------------------------------

/** One Squeek: `safeTransferFrom` to the vault locks it in one transaction with no approval. */
export async function lockOneSqueek(config: AppConfig, chainId: ChainId, vault: VaultDeployment, owner: Address, id: bigint): Promise<Hex> {
  const { request } = await simulateContract(config, { account: owner, chainId, address: vault.squeeks, abi: genesisTransferAbi, functionName: 'safeTransferFrom', args: [owner, vault.vault, id] })
  return writeContract(config, request)
}
/** Several Squeeks: approve the vault for the collection once, then `lock` them together. */
export async function setVaultApproval(config: AppConfig, chainId: ChainId, vault: VaultDeployment, approved: boolean): Promise<Hex> {
  const { request } = await simulateContract(config, { chainId, address: vault.squeeks, abi: erc721Abi, functionName: 'setApprovalForAll', args: [vault.vault, approved] })
  return writeContract(config, request)
}
export async function lockSqueeks(config: AppConfig, chainId: ChainId, vault: VaultDeployment, ids: bigint[]): Promise<Hex> {
  const { request } = await simulateContract(config, { chainId, address: vault.vault, abi: vaultAbi, functionName: 'lock', args: [ids] })
  return writeContract(config, request)
}
export async function unlockSqueeks(config: AppConfig, chainId: ChainId, vault: VaultDeployment, ids: bigint[]): Promise<Hex> {
  const { request } = await simulateContract(config, { chainId, address: vault.vault, abi: vaultAbi, functionName: 'unlock', args: [ids] })
  return writeContract(config, request)
}
export async function claimVault(config: AppConfig, chainId: ChainId, vault: VaultDeployment): Promise<Hex> {
  const { request } = await simulateContract(config, { chainId, address: vault.vault, abi: vaultAbi, functionName: 'claim' })
  return writeContract(config, request)
}
export async function harvestVault(config: AppConfig, chainId: ChainId, vault: VaultDeployment): Promise<Hex> {
  const { request } = await simulateContract(config, { chainId, address: vault.vault, abi: vaultAbi, functionName: 'harvest' })
  return writeContract(config, request)
}
