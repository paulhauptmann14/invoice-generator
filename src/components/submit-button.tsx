'use client'

import type * as React from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'

/**
 * Submit button of a `<form action={…}>` that disables itself and shows `pendingLabel` while the action
 * runs (e.g. "Wird kopiert …"), so a second click cannot start the action twice.
 * Must sit inside the form it submits (useFormStatus reads the nearest parent form).
 */
export function SubmitButton({
  pendingLabel,
  children,
  disabled,
  ...props
}: Omit<React.ComponentProps<typeof Button>, 'type' | 'asChild'> & { pendingLabel: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={disabled || pending} aria-busy={pending} {...props}>
      {pending ? pendingLabel : children}
    </Button>
  )
}
