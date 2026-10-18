import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth-shell'
import { SignOutButton } from '@/components/sign-out-button'

export const metadata: Metadata = { title: 'Kein Zugriff' }

export default function NoAccessPage() {
  return (
    <AuthShell title="Kein Zugriff">
      <p className="text-sm text-muted-foreground">Diesem Konto ist noch kein Betrieb zugeordnet. Die Freischaltung erfolgt durch den Inhaber.</p>
      <div className="mt-6 -ml-2">
        <SignOutButton />
      </div>
    </AuthShell>
  )
}
