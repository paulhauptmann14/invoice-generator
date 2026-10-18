import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth-shell'
import { FormAlert } from '@/components/form-alert'
import { loginNotice } from '@/features/auth/schemas'
import { LoginForm } from './login-form'

export const metadata: Metadata = { title: 'Anmelden' }

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const notice = loginNotice((await searchParams).hinweis)
  return (
    <AuthShell title="Anmelden" note="Zugang nur für freigeschaltete Konten.">
      {notice && (
        <div className="mb-5">
          <FormAlert>{notice.text}</FormAlert>
        </div>
      )}
      <LoginForm />
    </AuthShell>
  )
}
