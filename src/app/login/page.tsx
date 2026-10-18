import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthShell } from '@/components/auth-shell'
import { FormAlert } from '@/components/form-alert'
import { loginNotice } from '@/features/auth/schemas'
import { isPasswordResetEnabled, isRegistrationEnabled } from '@/lib/feature-flags'
import { LoginForm } from './login-form'

export const metadata: Metadata = { title: 'Anmelden' }

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const notice = loginNotice((await searchParams).hinweis)
  const registration = isRegistrationEnabled()
  return (
    <AuthShell
      title="Anmelden"
      note={
        registration ? (
          <Link href="/registrieren" className="inline-flex min-h-11 items-center underline underline-offset-4 md:min-h-0">
            Neu hier? Konto anlegen
          </Link>
        ) : (
          'Zugang nur für freigeschaltete Konten.'
        )
      }
    >
      {notice && (
        <div className="mb-5">
          <FormAlert>{notice.text}</FormAlert>
        </div>
      )}
      <LoginForm showPasswordReset={isPasswordResetEnabled()} />
    </AuthShell>
  )
}
