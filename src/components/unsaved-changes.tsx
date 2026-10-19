'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

type Guard = {
  /** Forms report whether they hold unsaved changes (keyed by a stable id per form). */
  setDirty: (id: string, dirty: boolean) => void
  /** Runs `proceed` right away when nothing is dirty, otherwise after the user confirmed discarding. */
  confirmLeave: (proceed: () => void) => void
  isDirty: () => boolean
}

const GuardContext = createContext<Guard | null>(null)

/**
 * Guards client-side navigation while a form has unsaved changes (the browser's beforeunload prompt only covers
 * closing or reloading the tab). Navigation components use GuardedLink; forms call useReportUnsaved(dirty).
 */
export function UnsavedChangesProvider({ children }: { children: React.ReactNode }) {
  const dirtyIds = useRef(new Set<string>())
  const returnFocusTo = useRef<HTMLElement | null>(null)
  const [pending, setPending] = useState<{ proceed: () => void } | null>(null)

  const setDirty = useCallback((id: string, dirty: boolean) => {
    if (dirty) dirtyIds.current.add(id)
    else dirtyIds.current.delete(id)
  }, [])
  const isDirty = useCallback(() => dirtyIds.current.size > 0, [])
  const confirmLeave = useCallback((proceed: () => void) => {
    if (dirtyIds.current.size === 0) return proceed()
    returnFocusTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setPending({ proceed })
  }, [])
  const guard = useMemo<Guard>(() => ({ setDirty, confirmLeave, isDirty }), [setDirty, confirmLeave, isDirty])

  return (
    <GuardContext value={guard}>
      {children}
      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            // Back to the link that was clicked (Radix has no trigger to return to); if it is gone, keep the default.
            const target = returnFocusTo.current
            returnFocusTo.current = null
            if (target?.isConnected) {
              event.preventDefault()
              target.focus()
            }
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Ungespeicherte Änderungen verwerfen?</AlertDialogTitle>
            <AlertDialogDescription>Die Änderungen auf dieser Seite sind noch nicht gespeichert und gehen beim Verlassen verloren.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Weiter bearbeiten</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => pending?.proceed()}>
              Verwerfen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </GuardContext>
  )
}

/** Reports the dirty state of one form to the guard; a no-op outside a provider. */
export function useReportUnsaved(dirty: boolean) {
  const guard = useContext(GuardContext)
  const id = useId()
  useEffect(() => {
    if (!guard) return
    guard.setDirty(id, dirty)
    return () => guard.setDirty(id, false)
  }, [guard, id, dirty])
}

/** Next.js link that asks for confirmation when a form on the page has unsaved changes. */
export function GuardedLink({ href, onClick, target, ...props }: Omit<React.ComponentProps<typeof Link>, 'href'> & { href: string }) {
  const guard = useContext(GuardContext)
  const router = useRouter()
  return (
    <Link
      href={href}
      target={target}
      onClick={(event) => {
        onClick?.(event)
        if (event.defaultPrevented || !guard?.isDirty()) return
        // Leave modified clicks (new tab/window, download) and external targets to the browser.
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        if (target && target !== '_self') return
        // A link to the page that is already open would navigate nowhere: nothing to confirm.
        if (href === `${window.location.pathname}${window.location.search}`) return
        event.preventDefault()
        guard.confirmLeave(() => router.push(href))
      }}
      {...props}
    />
  )
}
