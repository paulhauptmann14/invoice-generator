import { describe, expect, test } from 'vitest'
import { apiPath, pickTenant, switchTenantPath, tenantIdFromPath, tenantPath } from './tenant-paths'

const A = 'c0000000-0000-4000-8000-000000000001'
const B = 'c0000000-0000-4000-8000-000000000002'

describe('tenantPath / apiPath', () => {
  test('defaults to the invoice list', () => expect(tenantPath(A)).toBe(`/b/${A}/rechnungen`))
  test('appends a sub path without double slashes', () => expect(tenantPath(A, '/kunden/neu')).toBe(`/b/${A}/kunden/neu`))
  test('keeps query strings', () => expect(tenantPath(A, 'kunden?gespeichert=1')).toBe(`/b/${A}/kunden?gespeichert=1`))
  test('api path', () => expect(apiPath(A, 'invoices/preview')).toBe(`/api/b/${A}/invoices/preview`))
})

describe('tenantIdFromPath', () => {
  test('reads the tenant of an app path', () => expect(tenantIdFromPath(`/b/${A}/kunden/123`)).toBe(A))
  test('reads the tenant root', () => expect(tenantIdFromPath(`/b/${A}`)).toBe(A))
  test('ignores api paths and others', () => {
    expect(tenantIdFromPath(`/api/b/${A}/invoices/preview`)).toBeNull()
    expect(tenantIdFromPath('/rechnungen')).toBeNull()
  })
  test('rejects invalid ids', () => expect(tenantIdFromPath('/b/not-a-uuid/kunden')).toBeNull())
})

describe('switchTenantPath', () => {
  test('keeps the section', () => expect(switchTenantPath(`/b/${A}/kunden`, B)).toBe(`/b/${B}/kunden`))
  test('drops detail paths (ids belong to the old tenant)', () => {
    expect(switchTenantPath(`/b/${A}/rechnungen/${A}`, B)).toBe(`/b/${B}/rechnungen`)
    expect(switchTenantPath(`/b/${A}/artikel/neu`, B)).toBe(`/b/${B}/artikel`)
  })
  test('unknown paths fall back to the invoice list', () => {
    expect(switchTenantPath('/irgendwas', B)).toBe(`/b/${B}/rechnungen`)
    expect(switchTenantPath(`/b/${A}`, B)).toBe(`/b/${B}/rechnungen`)
  })
})

describe('pickTenant', () => {
  const tenants = [
    { id: A, name: 'Gasthaus' },
    { id: B, name: 'Metzgerei' },
  ]
  test('prefers the remembered tenant', () => expect(pickTenant(tenants, B)?.id).toBe(B))
  test('falls back to the first tenant for unknown or missing ids', () => {
    expect(pickTenant(tenants, 'c0000000-0000-4000-8000-000000000009')?.id).toBe(A)
    expect(pickTenant(tenants, undefined)?.id).toBe(A)
  })
  test('no tenants -> null', () => expect(pickTenant([], A)).toBeNull())
})
