'use client'

import { Button } from '@/components/ui/button'

/**
 * Calm message of the error boundaries. "Erneut versuchen" fetches the server data again and re-renders the failed segment
 * (Next's `retry`: refresh + reset, so a transient database error recovers); the start page is a plain
 * link (full page load) so it works even when client-side navigation or the layout is what broke.
 */
export function ErrorPanel({ retry }: { retry: () => void }) {
  return (
    <section className="surface w-full max-w-sm rounded-2xl p-6 sm:p-8" aria-labelledby="error-title">
      <h1 id="error-title" className="type-large-title">
        Etwas ist schiefgelaufen.
      </h1>
      <p className="mt-4 text-sm text-muted-foreground">Die Seite konnte nicht angezeigt werden. Bitte noch einmal versuchen.</p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button type="button" onClick={retry}>
          Erneut versuchen
        </Button>
        <Button asChild variant="ghost">
          {/* A plain anchor on purpose: a full page load resets whatever state caused the error (also in global-error, where no router state can be trusted). */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/">Zur Startseite</a>
        </Button>
      </div>
    </section>
  )
}
