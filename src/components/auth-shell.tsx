/**
 * Frame of the public pages (sign-in, password reset, no access): the wordmark with one sentence on
 * what the app does, next to the white form sheet. Stacked on small screens.
 */
export function AuthShell({ title, children, note }: { title: string; children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <main className="mx-auto grid min-h-dvh max-w-5xl content-center gap-10 px-4 py-12 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-center lg:gap-16">
      <div className="max-w-md">
        <p className="text-[3rem] leading-[1.02] font-bold tracking-[-0.03em] lg:text-[4.25rem] lg:tracking-[-0.035em]">Rechnungen</p>
        <p className="mt-4 text-base text-muted-foreground">
          Rechnungen schreiben, als PDF oder Word-Datei exportieren und archivieren – für jeden Betrieb getrennt.
        </p>
      </div>
      <div className="w-full max-w-md">
        <section aria-labelledby="auth-title" className="surface rounded-2xl p-6 sm:p-8">
          <h1 id="auth-title" className="type-large-title">
            {title}
          </h1>
          <div className="mt-6">{children}</div>
        </section>
        {note && <div className="mt-4 px-1 text-sm text-muted-foreground">{note}</div>}
      </div>
    </main>
  )
}
