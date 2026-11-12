'use client'

import { useEffect, useRef, useState } from 'react'
import type { z } from 'zod'
import type { FormState } from '@/lib/form'

type ClientErrors<K extends string> = Partial<Record<K, string | null>>

/**
 * Field errors for a form: server errors after submit, overridden by client-side checks when a field
 * loses focus (same zod schema as the server; null = field is now valid). After a failed submit,
 * focus moves to the first invalid field.
 *
 * A field also loses focus when a button is pressed. Showing the check's result right then can resize the
 * form under the pointer (a two-line error turns into a one-line hint), the button moves away before the
 * pointer is released, and the click is lost. While a pointer is down, results wait until it is released.
 */
export function useBlurValidation<K extends string>(schema: z.ZodObject, state: FormState<K>, order: readonly K[]) {
  const [clientErrors, setClientErrors] = useState<ClientErrors<K>>({})
  const [seenState, setSeenState] = useState(state)
  const formRef = useRef<HTMLFormElement>(null)
  const pointerDown = useRef(false)
  const pending = useRef<ClientErrors<K>>({})

  useEffect(() => {
    const down = () => {
      pointerDown.current = true
    }
    // After the click (which follows pointerup), so the pressed button is still where it was.
    const up = () => {
      pointerDown.current = false
      window.setTimeout(() => {
        const results = pending.current
        pending.current = {}
        if (Object.keys(results).length > 0) setClientErrors((prev) => ({ ...prev, ...results }))
      }, 0)
    }
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', up, true)
    return () => {
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('pointerup', up, true)
      window.removeEventListener('pointercancel', up, true)
    }
  }, [])

  // A new server response replaces earlier client-side results (adjust state during render, no effect).
  if (seenState !== state) {
    setSeenState(state)
    setClientErrors({})
  }

  useEffect(() => {
    const first = order.find((k) => state.fieldErrors[k])
    if (first) formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus()
  }, [state, order])

  const errors: Partial<Record<K, string>> = {}
  for (const k of order) {
    const client = clientErrors[k]
    const message = client === undefined ? state.fieldErrors[k] : client
    if (message) errors[k] = message
  }

  function onBlur(event: React.FocusEvent<HTMLFormElement>) {
    const target: EventTarget = event.target
    const isControl =
      target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement
    if (!isControl) return
    const name = target.name as K
    if (!order.includes(name)) return
    const fieldSchema = schema.shape[name] as z.ZodType | undefined
    if (!fieldSchema) return
    const result = fieldSchema.safeParse(target.value)
    const message = result.success ? null : (result.error.issues[0]?.message ?? null)
    if (pointerDown.current) pending.current = { ...pending.current, [name]: message }
    else setClientErrors((prev) => ({ ...prev, [name]: message }))
  }

  return { errors, formRef, onBlur }
}
