import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const signUp = vi.fn()
const createClient = vi.fn(async () => ({ auth: { signUp } }))
vi.mock('@/lib/supabase/server', () => ({ createClient }))

// Like the real helpers, notFound() and redirect() never return (they throw).
const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})
const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`)
})
vi.mock('next/navigation', () => ({ notFound, redirect }))

const { register } = await import('./register-actions')

const initial = { message: null, existing: false, errors: {}, email: '' }
const PASSWORD = 'a-long-enough-password-1'

function form(values: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}
const valid = { email: ' Neu@Example.de ', password: PASSWORD, confirm: PASSWORD }

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('register with REGISTRATION off', () => {
  it('responds with 404 without creating a Supabase client', async () => {
    await expect(register(initial, form(valid))).rejects.toThrow('NEXT_NOT_FOUND')
    expect(notFound).toHaveBeenCalled()
    expect(createClient).not.toHaveBeenCalled()
  })
})

describe('register with REGISTRATION=on', () => {
  beforeEach(() => {
    vi.stubEnv('REGISTRATION', 'on')
  })

  it('validates the input before talking to Supabase', async () => {
    const result = await register(initial, form({ email: 'kein-mail', password: 'kurz', confirm: 'anders' }))
    expect(result.errors.email).toBeTruthy()
    expect(result.errors.password).toBe('Mindestens 12 Zeichen.')
    expect(result.email).toBe('kein-mail')
    expect(createClient).not.toHaveBeenCalled()
  })

  it('reports mismatching passwords at the confirmation field', async () => {
    const result = await register(initial, form({ ...valid, confirm: 'b'.repeat(14) }))
    expect(result.errors.confirm).toBe('Die Passwörter stimmen nicht überein.')
    expect(signUp).not.toHaveBeenCalled()
  })

  it('signs up with the trimmed address and opens the welcome page', async () => {
    signUp.mockResolvedValue({ data: { session: { access_token: 'x' } }, error: null })
    await expect(register(initial, form(valid))).rejects.toThrow('NEXT_REDIRECT:/willkommen')
    expect(signUp).toHaveBeenCalledWith({ email: 'Neu@Example.de', password: PASSWORD })
  })

  it('sends the user to the login when no session results', async () => {
    signUp.mockResolvedValue({ data: { session: null }, error: null })
    await expect(register(initial, form(valid))).rejects.toThrow('NEXT_REDIRECT:/login')
  })

  it.each(['user_already_exists', 'email_exists'])('maps %s to the existing-account message', async (code) => {
    signUp.mockResolvedValue({ data: { session: null }, error: { code, message: 'x' } })
    const result = await register(initial, form(valid))
    expect(result).toMatchObject({ existing: true, message: 'Für diese Adresse gibt es schon ein Konto – bitte anmelden.', email: 'Neu@Example.de' })
  })

  it('maps weak_password to the password field', async () => {
    signUp.mockResolvedValue({ data: { session: null }, error: { code: 'weak_password', message: 'x' } })
    const result = await register(initial, form(valid))
    expect(result.errors.password).toBe('Dieses Passwort ist zu schwach. Bitte ein längeres wählen.')
  })

  it('maps signup_disabled to the switched-off message', async () => {
    signUp.mockResolvedValue({ data: { session: null }, error: { code: 'signup_disabled', message: 'x' } })
    const result = await register(initial, form(valid))
    expect(result.message).toBe('Die Registrierung ist ausgeschaltet.')
  })

  it('shows a generic message for anything else and logs only the code', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    signUp.mockResolvedValue({ data: { session: null }, error: { code: 'unexpected_failure', message: 'secret detail neu@example.de' } })
    const result = await register(initial, form(valid))
    expect(result.message).toBe('Das Konto konnte nicht angelegt werden. Bitte erneut versuchen.')
    expect(error).toHaveBeenCalledWith('Sign-up failed', 'unexpected_failure')
    expect(JSON.stringify(error.mock.calls)).not.toContain('neu@example.de')
    error.mockRestore()
  })
})
