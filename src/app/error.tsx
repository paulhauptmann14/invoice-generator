'use client'

import { ErrorPanel } from '@/components/error-panel'

/** Errors outside a business's app shell (sign-in, start page, …). */
export default function RootError({ retry }: { retry: () => void }) {
  return (
    <main className="min-h-dvh px-4 py-12 sm:px-[12vw] sm:py-[14vh]">
      <p className="type-headline text-muted-foreground">Rechnungen</p>
      <div className="mt-6">
        <ErrorPanel retry={retry} />
      </div>
    </main>
  )
}
