import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import type { Database } from '@/lib/supabase/database.types'
import { SEED } from '@/test-support/seed-ids'
import { requestReset } from './recovery'

// Password reset against local Supabase + Mailpit (test inbox of the Supabase CLI).
const MAILPIT = 'http://127.0.0.1:54324/api/v1'
const TEMP_PASSWORD = 'neues-lokales-passwort-456'

const client = () =>
  createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

type MailSummary = { ID: string; To: { Address: string }[] }

async function mailsTo(address: string): Promise<MailSummary[]> {
  const response = await fetch(`${MAILPIT}/messages`)
  const body = (await response.json()) as { messages: MailSummary[] }
  return body.messages.filter((m) => m.To.some((t) => t.Address === address))
}

async function waitForMail(address: string): Promise<{ HTML: string; Subject: string }> {
  for (let i = 0; i < 40; i++) {
    const [mail] = await mailsTo(address)
    if (mail) return (await (await fetch(`${MAILPIT}/message/${mail.ID}`)).json()) as { HTML: string; Subject: string }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`No mail for ${address}`)
}

let tokenHash = ''
let link = ''

beforeAll(async () => {
  await fetch(`${MAILPIT}/messages`, { method: 'DELETE' })
  const { error } = await client().auth.resetPasswordForEmail(SEED.dev)
  if (error) throw error
  const mail = await waitForMail(SEED.dev)
  link = /href="([^"]+)"/.exec(mail.HTML)?.[1]?.replace(/&amp;/g, '&') ?? ''
  tokenHash = new URL(link).searchParams.get('token_hash') ?? ''
})

afterAll(async () => {
  // Always leave the seeded password in place for the other tests and the browser checks.
  const supabase = client()
  const { error } = await supabase.auth.signInWithPassword({ email: SEED.dev, password: TEMP_PASSWORD })
  if (!error) await supabase.auth.updateUser({ password: SEED.password })
})

describe('password reset (local Supabase + Mailpit)', () => {
  test('the e-mail links to the app with a token hash', () => {
    expect(link).toMatch(/^http:\/\/localhost:3000\/auth\/bestaetigen\?token_hash=[^&]+&type=recovery$/)
    expect(tokenHash.length).toBeGreaterThan(20)
  })

  test('verifyOtp turns the token into a session; the new password works; the token is single-use', async () => {
    const supabase = client()
    const { data, error } = await supabase.auth.verifyOtp({ type: 'recovery', token_hash: tokenHash })
    expect(error).toBeNull()
    expect(data.session?.user.email).toBe(SEED.dev)

    const weak = await supabase.auth.updateUser({ password: 'kurz' })
    expect(weak.error?.code).toBe('weak_password')

    expect((await supabase.auth.updateUser({ password: TEMP_PASSWORD })).error).toBeNull()
    expect((await client().auth.signInWithPassword({ email: SEED.dev, password: TEMP_PASSWORD })).error).toBeNull()

    const again = await client().auth.verifyOtp({ type: 'recovery', token_hash: tokenHash })
    expect(again.error).not.toBeNull()
  })

  test('an unknown address gets the same answer and no mail', async () => {
    const address = `niemand-${Date.now()}@invoice.localhost`
    expect((await client().auth.resetPasswordForEmail(address)).error).toBeNull()
    await new Promise((r) => setTimeout(r, 1000))
    expect(await mailsTo(address)).toEqual([])
  })
  test('the request always gets the same answer, also when Supabase rate-limits an existing account', async () => {
    // Two quick requests for an existing account: Supabase answers the second one with 429, an unknown
    // address never gets 429. Passing that through would reveal which addresses have an account.
    expect(await requestReset(client(), SEED.dev)).toBe('sent')
    expect(await requestReset(client(), SEED.dev)).toBe('sent')
    expect(await requestReset(client(), `niemand-${Date.now()}@invoice.localhost`)).toBe('sent')
  })
})
