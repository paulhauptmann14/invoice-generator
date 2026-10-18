import { describe, expect, it } from 'vitest'
import { isPasswordResetEnabled } from './feature-flags'

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
