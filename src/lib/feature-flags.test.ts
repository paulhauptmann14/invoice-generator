import { describe, expect, it } from 'vitest'
import { isPasswordResetEnabled, isRegistrationEnabled } from './feature-flags'

describe('isPasswordResetEnabled', () => {
  it('is enabled by default', () => {
    expect(isPasswordResetEnabled({})).toBe(true)
  })

  it('is disabled only by PASSWORD_RESET_EMAIL=off', () => {
    expect(isPasswordResetEnabled({ PASSWORD_RESET_EMAIL: 'off' })).toBe(false)
  })

  it('stays enabled for other values', () => {
    expect(isPasswordResetEnabled({ PASSWORD_RESET_EMAIL: 'on' })).toBe(true)
    expect(isPasswordResetEnabled({ PASSWORD_RESET_EMAIL: '' })).toBe(true)
  })
})

describe('isRegistrationEnabled', () => {
  it('is disabled by default', () => {
    expect(isRegistrationEnabled({})).toBe(false)
  })

  it('is enabled only by REGISTRATION=on', () => {
    expect(isRegistrationEnabled({ REGISTRATION: 'on' })).toBe(true)
  })

  it('stays disabled for other values', () => {
    expect(isRegistrationEnabled({ REGISTRATION: 'off' })).toBe(false)
    expect(isRegistrationEnabled({ REGISTRATION: 'ON' })).toBe(false)
    expect(isRegistrationEnabled({ REGISTRATION: 'true' })).toBe(false)
    expect(isRegistrationEnabled({ REGISTRATION: '' })).toBe(false)
  })
})
