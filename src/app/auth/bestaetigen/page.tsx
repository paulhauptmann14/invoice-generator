import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { AuthShell } from '@/components/auth-shell'
import { Button } from '@/components/ui/button'
import { confirmRecovery } from '@/features/auth/password-actions'
import { parseRecoveryLink } from '@/features/auth/recovery'
import { isPasswordResetEnabled } from '@/lib/feature-flags'

export const metadata: Metadata = { title: 'Neues Passwort festlegen' }

/**
 * Target of the link in the reset e-mail. Opening it changes nothing (mail scanners prefetch links);
 * the one-time token is redeemed only by the button (POST via server action).
 */
export default async function ConfirmRecoveryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!isPasswordResetEnabled()) notFound()
  const query = await searchParams
  const tokenHash = parseRecoveryLink(query.type, query.token_hash)
  if (!tokenHash) redirect('/login?hinweis=link-ungueltig')

  return (
    <AuthShell title="Neues Passwort festlegen">
      <form action={confirmRecovery} className="space-y-5">
        <input type="hidden" name="token_hash" value={tokenHash} />
        <p className="text-sm text-muted-foreground">Der Link aus der E-Mail ist bereit. Im nächsten Schritt wird das neue Passwort gewählt.</p>
        <Button type="submit" className="w-full" size="lg">
          Weiter
        </Button>
      </form>
    </AuthShell>
  )
}
