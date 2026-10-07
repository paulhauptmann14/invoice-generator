import type { z } from 'zod'

/** Shared state shape for useActionState forms: German messages, per-field errors, submitted values. */
export type FormState<K extends string> = {
  message: string | null
  fieldErrors: Partial<Record<K, string>>
  values: Partial<Record<K, string>>
}

export function emptyFormState<K extends string>(values: Partial<Record<K, string>> = {}): FormState<K> {
  return { message: null, fieldErrors: {}, values }
}

export function fieldErrorsFrom<K extends string>(error: z.ZodError): Partial<Record<K, string>> {
  const errors: Partial<Record<K, string>> = {}
  for (const issue of error.issues) {
    const key = issue.path[0] as K | undefined
    if (key !== undefined && errors[key] === undefined) errors[key] = issue.message
  }
  return errors
}

/** Errors keyed by dotted path ("recipient.name", "items.2.quantity"); first message per path. */
export function pathErrorsFrom(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.')
    if (errors[key] === undefined) errors[key] = issue.message
  }
  return errors
}
