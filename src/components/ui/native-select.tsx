import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Native <select> styled like Input: accessible, works with mobile pickers, no portal/CSP concerns. */
export function NativeSelect({ className, children, ...props }: React.ComponentProps<'select'>) {
  return (
    <div className="relative">
      <select
        className={cn(
          'h-11 w-full appearance-none rounded-md border border-input bg-card pr-9 pl-2.5 text-base md:h-10 md:text-sm',
          'aria-invalid:border-destructive disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
}
