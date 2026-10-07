import { describe, expect, test } from 'vitest'
import { addDays, formatDateDe, parseIsoDate, todayIso, yearOf } from './dates'

describe('dates', () => {
  test('parseIsoDate', () => {
    expect(parseIsoDate('2026-10-07')).toEqual({ y: 2026, m: 10, d: 7 })
    expect(() => parseIsoDate('07.10.2026')).toThrow('Invalid date')
    expect(() => parseIsoDate('2026-02-30')).toThrow('Invalid date')
  })
  test('formatDateDe', () => {
    expect(formatDateDe('2026-10-07')).toBe('07.10.2026')
  })
  test('addDays across year and leap-year boundaries', () => {
    expect(addDays('2026-10-07', 14)).toBe('2026-10-21')
    expect(addDays('2026-12-25', 14)).toBe('2027-01-08')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2026-10-07', 0)).toBe('2026-10-07')
  })
  test('yearOf', () => {
    expect(yearOf('2026-10-07')).toBe(2026)
  })
  test('todayIso uses the Europe/Berlin time zone', () => {
    expect(todayIso('Europe/Berlin', new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01')
    expect(todayIso('Europe/Berlin', new Date('2026-10-07T10:00:00Z'))).toBe('2026-10-07')
  })
})
