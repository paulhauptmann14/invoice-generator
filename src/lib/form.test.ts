import { expect, test } from 'vitest'
import { z } from 'zod'
import { emptyFormState, fieldErrorsFrom } from './form'

test('emptyFormState has no errors and keeps initial values', () => {
  expect(emptyFormState({ name: 'A' })).toEqual({ message: null, fieldErrors: {}, values: { name: 'A' } })
})

test('fieldErrorsFrom returns the first message per field', () => {
  const schema = z.object({ name: z.string().min(1, 'Name fehlt'), city: z.string().min(2, 'Ort zu kurz').max(3) })
  const result = schema.safeParse({ name: '', city: 'x' })
  expect(result.success).toBe(false)
  expect(fieldErrorsFrom(result.error!)).toEqual({ name: 'Name fehlt', city: 'Ort zu kurz' })
})
