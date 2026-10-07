import { SignOutButton } from '@/components/sign-out-button'
import { SkipLink } from '@/components/skip-link'
import { requireMember } from '@/lib/auth/require-member'
import { parseCompany } from '@/lib/domain/company'
import { SideNav, TabBar } from './main-nav'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, email } = await requireMember()
  const { data } = await supabase.from('settings').select('company').single()
  const companyName = parseCompany(data?.company).name || 'Rechnungen'

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[14rem_1fr]">
      <SkipLink />
      <aside className="flex items-center justify-between gap-4 border-b border-border px-4 py-2 md:sticky md:top-0 md:h-dvh md:flex-col md:items-stretch md:justify-start md:border-r md:border-b-0 md:px-0 md:py-0">
        <p className="font-display text-base leading-tight font-semibold tracking-[0.12em] uppercase md:px-6 md:pt-8 md:pb-6">
          {companyName}
        </p>
        <SideNav />
        <div className="md:mt-auto md:px-4 md:py-6">
          <p className="hidden truncate px-2 text-xs text-muted-foreground md:block" title={email ?? undefined}>
            {email}
          </p>
          <SignOutButton />
        </div>
      </aside>
      {/* Bottom padding keeps content clear of the fixed mobile tab bar. */}
      <main
        id="inhalt"
        tabIndex={-1}
        className="px-4 pt-6 pb-[calc(5rem+env(safe-area-inset-bottom))] outline-none sm:px-8 md:px-12 md:py-10"
      >
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
      <TabBar />
    </div>
  )
}
