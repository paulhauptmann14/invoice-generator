import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth-shell'
import { SignOutButton } from '@/components/sign-out-button'
import { requireUserWithoutTenant } from '@/lib/auth/require-tenant'
import { FirstTenantForm } from './first-tenant-form'

export const metadata: Metadata = { title: 'Willkommen' }

/** Empty state of a new account: exactly one action, the first business. Users with a business go on to the app. */
export default async function WelcomePage() {
  await requireUserWithoutTenant()
  return (
    <AuthShell title="Willkommen!">
      <FirstTenantForm />
      {/* A way out for a mistyped address or the wrong account (signed-in users cannot reach /login). */}
      <div className="mt-6 -ml-2">
        <SignOutButton />
      </div>
    </AuthShell>
  )
}
