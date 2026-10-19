'use client'

import { ErrorPanel } from '@/components/error-panel'
import './globals.css'

/** Last resort when the root layout itself fails; replaces it, so it brings its own <html> and <body>. */
export default function GlobalError({ retry }: { retry: () => void }) {
  return (
    <html lang="de">
      <body className="min-h-dvh antialiased">
        <main className="min-h-dvh px-4 py-12 sm:px-[12vw] sm:py-[14vh]">
          <p className="type-headline text-muted-foreground">Rechnungen</p>
          <div className="mt-6">
            <ErrorPanel retry={retry} />
          </div>
        </main>
      </body>
    </html>
  )
}
