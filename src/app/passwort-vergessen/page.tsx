import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AuthShell } from '@/components/auth-shell'
import { isPasswordResetEnabled } from '@/lib/feature-flags'
import { ResetRequestForm } from './reset-request-form'

export const metadata: Metadata = { title: 'Passwort vergessen' }

export default function ForgotPasswordPage() {
  if (!isPasswordResetEnabled()) notFound()
  return (
    <AuthShell
      title="Passwort vergessen"
      note={
        <Link href="/login" className="inline-flex min-h-11 items-center underline underline-offset-4 md:min-h-0">
          Zurück zur Anmeldung
        </Link>
      }
    >
      <ResetRequestForm />
    </AuthShell>
  )
}
