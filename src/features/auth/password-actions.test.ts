import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createClient = vi.fn()
vi.mock('@/lib/supabase/server', () => ({ createClient }))

// Like the real helpers, notFound() and redirect() never return (they throw).
const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})
const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`)
})
vi.mock('next/navigation', () => ({ notFound, redirect }))

const { confirmRecovery, requestPasswordReset, setNewPassword } = await import('./password-actions')

describe('password reset actions with PASSWORD_RESET_EMAIL=off', () => {
  beforeEach(() => {
    vi.stubEnv('PASSWORD_RESET_EMAIL', 'off')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('requestPasswordReset returns an error without touching Supabase', async () => {
    const form = new FormData()
    form.set('email', 'dev@invoice.localhost')
    const result = await requestPasswordReset({ status: 'idle', fieldError: null, email: '' }, form)
    expect(result.status).toBe('error')
    expect(result.fieldError).toBeTruthy()
    expect(createClient).not.toHaveBeenCalled()
  })

  it('confirmRecovery responds with 404 without touching Supabase', async () => {
    await expect(confirmRecovery(new FormData())).rejects.toThrow('NEXT_NOT_FOUND')
    expect(notFound).toHaveBeenCalled()
    expect(createClient).not.toHaveBeenCalled()
  })

  it('setNewPassword responds with 404 without touching Supabase', async () => {
    const form = new FormData()
    form.set('password', 'a-long-enough-password-1')
    form.set('confirm', 'a-long-enough-password-1')
    await expect(setNewPassword({ message: null, errors: {} }, form)).rejects.toThrow('NEXT_NOT_FOUND')
    expect(notFound).toHaveBeenCalled()
    expect(createClient).not.toHaveBeenCalled()
  })
})
