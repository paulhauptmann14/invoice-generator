import type { Metadata } from 'next'
import { LoginForm } from './login-form'

export const metadata: Metadata = { title: 'Anmelden' }

export default function LoginPage() {
  return (
    <main className="min-h-dvh px-4 py-12 sm:px-[12vw] sm:py-[14vh]">
      <p className="font-display text-sm font-semibold tracking-[0.18em] text-muted-foreground uppercase">Rechnungen</p>
      <section className="mt-6 w-full max-w-sm rounded-md border border-border bg-card p-6 sm:p-8">
        <h1 className="font-display text-[2rem] leading-none font-semibold">Anmelden</h1>
        <div className="mt-6">
          <LoginForm />
        </div>
      </section>
      <p className="mt-4 max-w-sm text-sm text-muted-foreground">Zugang nur für freigeschaltete Konten.</p>
    </main>
  )
}
