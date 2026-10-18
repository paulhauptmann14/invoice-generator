import { afterEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
const requireUserWithoutTenant = vi.fn(async () => ({ supabase: { rpc }, userId: 'u', email: null }))
const requireUser = vi.fn()
vi.mock('@/lib/auth/require-tenant', () => ({ requireUser, requireUserWithoutTenant }))

const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`)
})
vi.mock('next/navigation', () => ({ redirect }))

const { createFirstTenant } = await import('./actions')

const ID = 'c0000000-0000-4000-8000-000000000009'
const initial = { error: null, name: '' }
function form(name: string) {
  const data = new FormData()
  data.set('name', name)
  return data
}

afterEach(() => vi.clearAllMocks())

describe('createFirstTenant', () => {
  it('creates the business and opens its company settings with the confirmation flag', async () => {
    rpc.mockResolvedValue({ data: ID, error: null })
    await expect(createFirstTenant(initial, form('  Gasthaus Neu '))).rejects.toThrow(`NEXT_REDIRECT:/b/${ID}/einstellungen/firma?angelegt=1`)
    expect(rpc).toHaveBeenCalledWith('create_tenant', { p_name: 'Gasthaus Neu' })
    expect(requireUser).not.toHaveBeenCalled()
  })

  it('rejects a blank name without calling the database', async () => {
    const result = await createFirstTenant(initial, form('   '))
    expect(result.error).toBe('Bitte einen Namen eingeben.')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('shows a German error when the database refuses', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const result = await createFirstTenant(initial, form('Betrieb'))
    expect(result).toEqual({ error: 'Der Betrieb konnte nicht angelegt werden. Bitte erneut versuchen.', name: 'Betrieb' })
    log.mockRestore()
  })
})
