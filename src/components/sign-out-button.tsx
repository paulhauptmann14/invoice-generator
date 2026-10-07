import { LogOut } from 'lucide-react'
import { signOut } from '@/app/login/actions'
import { Button } from '@/components/ui/button'

export function SignOutButton() {
  return (
    <form action={signOut}>
      <Button type="submit" variant="ghost" className="gap-2 px-2 text-muted-foreground hover:text-foreground">
        <LogOut aria-hidden className="size-4" />
        Abmelden
      </Button>
    </form>
  )
}
