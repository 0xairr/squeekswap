'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { WagmiProvider } from 'wagmi'
import { config } from '@/lib/wagmi'

export function Providers({ children }: { children: ReactNode }) {
  // Localhost and privacy-focused browsers can report navigator.onLine=false even while same-origin
  // APIs work. These are idempotent reads, so run them and let HTTP errors decide availability.
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1, networkMode: 'always' } } }))
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  )
}
