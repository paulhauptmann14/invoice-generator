import type { Metadata } from 'next'
import { Barlow_Condensed, IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google'
import { connection } from 'next/server'
import './globals.css'

const sans = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-plex-sans', display: 'swap' })
const display = Barlow_Condensed({ subsets: ['latin'], weight: ['600'], variable: '--font-barlow', display: 'swap' })
// Only used for invoice-number stamps, never above the fold on first load.
const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['500'],
  variable: '--font-plex-mono',
  display: 'swap',
  preload: false,
})

export const metadata: Metadata = {
  title: { default: 'Rechnungen', template: '%s · Rechnungen' },
  robots: { index: false, follow: false },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Nonce-based CSP: every page must be rendered per request so scripts receive the nonce.
  await connection()
  return (
    <html lang="de" className={`${sans.variable} ${display.variable} ${mono.variable}`}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  )
}
