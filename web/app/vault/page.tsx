import { VaultClient } from '@/components/VaultClient'

export const metadata = {
  title: 'Squeek Cheeks vault · SqueekSwap',
  description: 'Lock a Squeek Genesis NFT for CHEEKS coins equal to its power. CHEEKS holders earn the SQK it makes in Squeekchain staking.',
}

export default function VaultPage() {
  return <VaultClient />
}
