import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AuthShell } from '@/components/auth-shell'
import { isRegistrationEnabled } from '@/lib/feature-flags'
import { RegisterForm } from './register-form'

export const metadata: Metadata = { title: 'Konto anlegen' }

export default function RegisterPage() {
  if (!isRegistrationEnabled()) notFound()
  return (
    <AuthShell
      title="Konto anlegen"
      note={
        <Link href="/login" className="inline-flex min-h-11 items-center underline underline-offset-4 md:min-h-0">
          Schon ein Konto? Zur Anmeldung
        </Link>
      }
    >
      <RegisterForm />
    </AuthShell>
  )
}
