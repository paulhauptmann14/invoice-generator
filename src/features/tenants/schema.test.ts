import { describe, expect, test } from 'vitest'
import { tenantNameSchema } from './schema'

describe('tenantNameSchema', () => {
  test('trims the name', () => expect(tenantNameSchema.parse('  Metzgerei  ')).toBe('Metzgerei'))
  test('rejects blank names', () =>
    expect(tenantNameSchema.safeParse('   ').error?.issues[0].message).toBe('Bitte einen Namen eingeben.'))
  test('rejects names longer than 120 characters', () =>
    expect(tenantNameSchema.safeParse('x'.repeat(121)).error?.issues[0].message).toBe('Höchstens 120 Zeichen.'))
  test('accepts exactly 120 characters', () => expect(tenantNameSchema.safeParse('x'.repeat(120)).success).toBe(true))
})
