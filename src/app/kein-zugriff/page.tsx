import type { Metadata } from 'next'
import { SignOutButton } from '@/components/sign-out-button'

export const metadata: Metadata = { title: 'Kein Zugriff' }

export default function NoAccessPage() {
  return (
    <main className="min-h-dvh px-4 py-12 sm:px-[12vw] sm:py-[14vh]">
      <p className="font-display text-sm font-semibold tracking-[0.18em] text-muted-foreground uppercase">Rechnungen</p>
      <section className="mt-6 w-full max-w-sm rounded-md border border-border bg-card p-6 sm:p-8">
        <h1 className="font-display text-[2rem] leading-none font-semibold">Kein Zugriff</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          Dieses Konto ist für die App nicht freigeschaltet. Die Freischaltung erfolgt durch den Inhaber.
        </p>
        <div className="-ml-2 mt-6">
          <SignOutButton />
        </div>
      </section>
    </main>
  )
}
