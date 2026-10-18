'use client'

import { useActionState, useEffect, useMemo, useRef, useState } from 'react'
import type { z } from 'zod'
import { pathErrorsFrom } from '@/lib/form'
import type { SettingsFormState } from './actions'
import { setIn } from './form-state'

type Action = (state: SettingsFormState, formData: FormData) => Promise<SettingsFormState>

const initialState: SettingsFormState = { message: null, errors: {} }

export type SettingsFormApi<T> = ReturnType<typeof useSettingsForm<T>>

/**
 * Controlled settings form: the draft is sent as JSON (hidden "payload"), like the invoice form.
 * Errors: server errors after submit, overridden per field by a client check on blur (same zod schema).
 * After a failed submit the error summary receives focus; unsaved changes trigger a leave warning.
 */
export function useSettingsForm<T>({
  initial,
  schema,
  action,
  idPrefix = 'set',
}: {
  initial: T
  schema: z.ZodType
  action: Action
  /** Element id prefix; needed when one page shows several forms with the same fields. */
  idPrefix?: string
}) {
  const [draft, setDraft] = useState<T>(initial)
  // Baseline of the first render; the page remounts the form (key) after a save.
  const [pristine] = useState(initial)
  const [state, formAction, pending] = useActionState(action, initialState)
  const [clientErrors, setClientErrors] = useState<Record<string, string | null>>({})
  const [seenState, setSeenState] = useState(state)
  const alertRef = useRef<HTMLDivElement>(null)

  // A new server response replaces earlier client-side results (adjust state during render, no effect).
  if (seenState !== state) {
    setSeenState(state)
    setClientErrors({})
  }

  useEffect(() => {
    if (state.message) alertRef.current?.focus()
  }, [state])

  const payload = useMemo(() => JSON.stringify(draft), [draft])
  const dirty = payload !== JSON.stringify(pristine)

  useEffect(() => {
    if (!dirty || pending) return
    const handler = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty, pending])

  const errors: Record<string, string> = { ...state.errors }
  for (const [path, message] of Object.entries(clientErrors)) {
    if (message === null) delete errors[path]
    else errors[path] = message
  }

  return {
    idPrefix,
    draft,
    payload,
    dirty,
    pending,
    state,
    errors,
    alertRef,
    formAction,
    set: (path: string, value: unknown) => setDraft((d) => setIn(d, path, value)),
    update: (fn: (d: T) => T) => setDraft(fn),
    /** Client check of one field on blur. */
    validate: (path: string) => {
      const result = schema.safeParse(draft)
      const message = result.success ? null : (pathErrorsFrom(result.error)[path] ?? null)
      setClientErrors((prev) => ({ ...prev, [path]: message }))
    },
    /** Drops errors below a path, e.g. after removing a list row (indexes shift). */
    clearErrors: (prefix: string) =>
      setClientErrors((prev) => {
        const next = { ...prev }
        for (const path of Object.keys(state.errors)) if (path.startsWith(prefix)) next[path] = null
        for (const path of Object.keys(prev)) if (path.startsWith(prefix)) next[path] = null
        return next
      }),
  }
}
