import type { Metadata } from 'next'
import { IBM_Plex_Mono } from 'next/font/google'
import { headers } from 'next/headers'
import { connection } from 'next/server'
import { CspNonce } from '@/components/csp-nonce'
import './globals.css'

// Only used for invoice numbers (list, editor, number field).
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
  const nonce = (await headers()).get('x-nonce') ?? ''
  return (
    <html lang="de" className={mono.variable}>
      <body className="min-h-dvh antialiased">
        <CspNonce nonce={nonce} />
        {children}
      </body>
    </html>
  )
}
