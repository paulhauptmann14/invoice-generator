/**
 * Frame of the public pages (sign-in, password reset, no access): the wordmark with one sentence on
 * what the app does, next to the white form sheet. Stacked on small screens.
 */
export function AuthShell({ title, children, note }: { title: string; children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <main className="mx-auto grid min-h-dvh max-w-5xl content-center gap-10 px-4 py-12 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-center lg:gap-16">
      <div className="max-w-md">
        <p className="font-display text-[3.25rem] leading-[0.9] font-semibold tracking-[-0.01em] lg:text-[5rem] lg:tracking-[-0.015em]">Rechnungen</p>
        <p className="mt-4 text-base text-muted-foreground">
          Rechnungen schreiben, als PDF oder Word-Datei exportieren und archivieren – für jeden Betrieb getrennt.
        </p>
      </div>
      <div className="w-full max-w-md">
        <section aria-labelledby="auth-title" className="rounded-md border border-border bg-card p-6 sm:p-8">
          <h1 id="auth-title" className="font-display text-[2rem] leading-none font-semibold">
            {title}
          </h1>
          <div className="mt-6">{children}</div>
        </section>
        {note && <div className="mt-4 text-sm text-muted-foreground">{note}</div>}
      </div>
    </main>
  )
}
