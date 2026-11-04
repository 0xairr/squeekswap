import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Archivo, IBM_Plex_Mono } from 'next/font/google'
import { Footer } from '@/components/Footer'
import { Header } from '@/components/Header'
import { Providers } from './providers'
import './globals.css'

const sans = Archivo({ subsets: ['latin'], axes: ['wdth'], variable: '--font-sans' })
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-mono' })

export const metadata: Metadata = {
  title: 'SqueekSwap | Squeek Genesis NFT swaps',
  description: 'Swap exact NFTs from the official Squeek Genesis collection. No sale, no escrow, no platform fee.',
  other: { 'squeekchain-project': '23acb0a5-e34f-4f8e-840d-f6780cbd1b81' },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <Providers>
          <Header />
          <main className="page">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  )
}
