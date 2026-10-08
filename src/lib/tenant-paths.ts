import { z } from 'zod'

/** App sections below /b/[betrieb]/. */
export const SECTIONS = ['rechnungen', 'kunden', 'artikel', 'einstellungen'] as const
export type Section = (typeof SECTIONS)[number]

/** Remembers the last opened tenant (convenience only; always checked against the user's tenants). */
export const LAST_TENANT_COOKIE = 'letzter-betrieb'

export type TenantSummary = { id: string; name: string }

const uuid = z.uuid()
const trimSlashes = (path: string) => path.replace(/^\/+/, '')

export function tenantPath(tenantId: string, path: string = 'rechnungen'): string {
  return `/b/${tenantId}/${trimSlashes(path)}`
}

export function apiPath(tenantId: string, path: string): string {
  return `/api/b/${tenantId}/${trimSlashes(path)}`
}

export function tenantIdFromPath(pathname: string): string | null {
  const [, prefix, id] = pathname.split('/')
  return prefix === 'b' && id && uuid.safeParse(id).success ? id : null
}

/** Same section in another tenant. Detail paths are dropped: their ids belong to the old tenant. */
export function switchTenantPath(pathname: string, targetId: string): string {
  const section = pathname.split('/')[3]
  return tenantPath(targetId, SECTIONS.includes(section as Section) ? section : 'rechnungen')
}

export function pickTenant(tenants: TenantSummary[], preferredId: string | null | undefined): TenantSummary | null {
  return tenants.find((t) => t.id === preferredId) ?? tenants[0] ?? null
}
