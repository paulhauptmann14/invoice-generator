'use client'

import { createContext, useContext } from 'react'
import { apiPath, type TenantSummary, tenantPath } from '@/lib/tenant-paths'

type TenantContextValue = { tenant: TenantSummary; tenants: TenantSummary[] }

const TenantContext = createContext<TenantContextValue | null>(null)

export function TenantProvider({ tenant, tenants, children }: TenantContextValue & { children: React.ReactNode }) {
  return <TenantContext.Provider value={{ tenant, tenants }}>{children}</TenantContext.Provider>
}

/** Current tenant plus path helpers for links and API calls below /b/[betrieb]. */
export function useTenant() {
  const value = useContext(TenantContext)
  if (!value) throw new Error('useTenant() outside of TenantProvider')
  return {
    ...value,
    path: (p?: string) => tenantPath(value.tenant.id, p),
    api: (p: string) => apiPath(value.tenant.id, p),
  }
}
