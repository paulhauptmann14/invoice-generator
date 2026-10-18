'use client'

import { Eye, EyeOff } from 'lucide-react'
import { Input } from '@/components/ui/input'

/** Password field with a show/hide toggle; paste and password managers stay allowed. */
export function PasswordInput({
  visible,
  onToggle,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Input>, 'type'> & { visible: boolean; onToggle: () => void }) {
  return (
    <div className="relative">
      <Input type={visible ? 'text' : 'password'} className={['pr-12', className].filter(Boolean).join(' ')} {...props} />
      <button
        type="button"
        onClick={onToggle}
        aria-label={visible ? 'Passwort verbergen' : 'Passwort anzeigen'}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:text-foreground"
      >
        {visible ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
      </button>
    </div>
  )
}
