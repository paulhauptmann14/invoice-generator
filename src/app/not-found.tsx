import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Nicht gefunden' }

/** Outside a tenant's app shell, e.g. an unknown or foreign business in the URL. */
export default function NotFound() {
  return (
    <main className="min-h-dvh px-4 py-12 sm:px-[12vw] sm:py-[14vh]">
      <p className="type-headline text-muted-foreground">Rechnungen</p>
      <section className="surface mt-6 w-full max-w-sm rounded-2xl p-6 sm:p-8">
        <h1 className="type-large-title">Nicht gefunden</h1>
        <p className="mt-4 text-sm text-muted-foreground">Diese Seite gibt es nicht oder sie gehört zu einem anderen Betrieb.</p>
        <Link href="/" className="mt-6 inline-flex min-h-11 items-center font-medium underline underline-offset-4 md:min-h-0">
          Zur Startseite
        </Link>
      </section>
    </main>
  )
}
