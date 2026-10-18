import { describe, expect, test } from 'vitest'
import { isFreshRecovery, parseRecoveryLink, RECOVERY_MAX_AGE_SECONDS } from './recovery'

const NOW = 1_800_000_000

describe('parseRecoveryLink', () => {
  test('accepts a recovery link with a plausible token hash (plain or pkce_ prefixed)', () => {
    expect(parseRecoveryLink('recovery', 'a1b2c3d4e5f6a1b2c3d4e5f6')).toBe('a1b2c3d4e5f6a1b2c3d4e5f6')
    expect(parseRecoveryLink('recovery', 'pkce_273198e34590785436b2118a2ef3cf3b')).toBe('pkce_273198e34590785436b2118a2ef3cf3b')
  })
  test('rejects other types, missing or malformed tokens', () => {
    expect(parseRecoveryLink('signup', 'a1b2c3d4e5f6a1b2c3d4e5f6')).toBeNull()
    expect(parseRecoveryLink('recovery', undefined)).toBeNull()
    expect(parseRecoveryLink('recovery', 'kurz')).toBeNull()
    expect(parseRecoveryLink('recovery', 'a1b2c3d4e5f6a1b2c3d4e5f6<script>')).toBeNull()
    expect(parseRecoveryLink(['recovery'], 'a1b2c3d4e5f6a1b2c3d4e5f6')).toBeNull()
  })
})

describe('isFreshRecovery', () => {
  test('a session from the e-mail link within the time window', () => {
    expect(isFreshRecovery({ amr: [{ method: 'otp', timestamp: NOW - 60 }] }, NOW)).toBe(true)
  })
  test('a normal password session may not set a new password without the old one', () => {
    expect(isFreshRecovery({ amr: [{ method: 'password', timestamp: NOW - 60 }] }, NOW)).toBe(false)
  })
  test('an old recovery session is no longer accepted', () => {
    expect(isFreshRecovery({ amr: [{ method: 'otp', timestamp: NOW - RECOVERY_MAX_AGE_SECONDS - 1 }] }, NOW)).toBe(false)
  })
  test('missing or malformed amr', () => {
    expect(isFreshRecovery({}, NOW)).toBe(false)
    expect(isFreshRecovery({ amr: 'otp' }, NOW)).toBe(false)
    expect(isFreshRecovery(null, NOW)).toBe(false)
  })
})
