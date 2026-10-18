import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AuthShell } from '@/components/auth-shell'
import { isFreshRecovery } from '@/features/auth/recovery'
import { createClient } from '@/lib/supabase/server'
import { NewPasswordForm } from './new-password-form'

export const metadata: Metadata = { title: 'Neues Passwort' }

/** Only for a fresh session from the reset e-mail link (see /auth/bestaetigen), never for a normal sign-in. */
export default async function NewPasswordPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const email = typeof data?.claims?.email === 'string' ? data.claims.email : null
  if (!email || !isFreshRecovery(data?.claims)) redirect('/login?hinweis=link-ungueltig')

  return (
    <AuthShell title="Neues Passwort">
      <NewPasswordForm email={email} />
    </AuthShell>
  )
}
