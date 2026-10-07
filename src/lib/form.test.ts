import { expect, test } from 'vitest'
import { z } from 'zod'
import { emptyFormState, fieldErrorsFrom, pathErrorsFrom } from './form'

test('emptyFormState has no errors and keeps initial values', () => {
  expect(emptyFormState({ name: 'A' })).toEqual({ message: null, fieldErrors: {}, values: { name: 'A' } })
})

test('fieldErrorsFrom returns the first message per field', () => {
  const schema = z.object({ name: z.string().min(1, 'Name fehlt'), city: z.string().min(2, 'Ort zu kurz').max(3) })
  const result = schema.safeParse({ name: '', city: 'x' })
  expect(result.success).toBe(false)
  expect(fieldErrorsFrom(result.error!)).toEqual({ name: 'Name fehlt', city: 'Ort zu kurz' })
})

test('pathErrorsFrom joins nested paths', () => {
  const schema = z.object({ a: z.object({ b: z.string().min(1, 'B fehlt') }), list: z.array(z.string().min(1, 'leer')).min(1, 'mind. 1') })
  const r1 = schema.safeParse({ a: { b: '' }, list: ['x', ''] })
  expect(pathErrorsFrom(r1.error!)).toEqual({ 'a.b': 'B fehlt', 'list.1': 'leer' })
  const r2 = schema.safeParse({ a: { b: 'x' }, list: [] })
  expect(pathErrorsFrom(r2.error!)).toEqual({ list: 'mind. 1' })
})
