'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useReportUnsaved } from '@/components/unsaved-changes'

function snapshot(form: HTMLFormElement): string {
  const entries: [string, string][] = []
  for (const [key, value] of new FormData(form)) if (typeof value === 'string') entries.push([key, value])
  return JSON.stringify(entries)
}

/**
 * Dirty tracking for uncontrolled forms: the form counts as changed while any field differs from its values at
 * mount (including defaults such as the preselected country). Reports to the navigation guard and returns the
 * handler to attach to the form's onInput and onChange.
 */
export function useFormDirty(formRef: React.RefObject<HTMLFormElement | null>) {
  const baseline = useRef<string | null>(null)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (formRef.current) baseline.current = snapshot(formRef.current)
  }, [formRef])

  const check = useCallback(() => {
    if (formRef.current && baseline.current !== null) setDirty(snapshot(formRef.current) !== baseline.current)
  }, [formRef])

  useReportUnsaved(dirty)

  // Closing or reloading the tab: the guard only covers in-app navigation.
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  return check
}
