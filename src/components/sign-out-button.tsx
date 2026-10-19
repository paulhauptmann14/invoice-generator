import { LogOut } from 'lucide-react'
import { signOut } from '@/app/login/actions'
import { Button } from '@/components/ui/button'

export function SignOutButton() {
  return (
    <form action={signOut}>
      <Button type="submit" variant="ghost" className="w-full justify-start gap-2.5 px-2.5 text-muted-foreground hover:bg-(--sidebar-hover) hover:text-foreground md:h-9">
        <LogOut aria-hidden className="size-4" />
        Abmelden
      </Button>
    </form>
  )
}
