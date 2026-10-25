import { describe, expect, test } from 'vitest'
import { buildFilename, normalizeUserFilename, storageSafeName, toAsciiFilename } from './filename'

describe('storageSafeName', () => {
  test.each([
    ['Müller & Söhne', 'Mueller-Soehne'],
    ['Café Zürich', 'Cafe-Zuerich'],
    ['RE/2026/1', 'RE-2026-1'],
    ['Straße', 'Strasse'],
    ['   ', ''],
    ['Rechnung Müller 3.pdf', 'Rechnung-Mueller-3.pdf'],
  ])('%s -> %s', (input, expected) => {
    expect(storageSafeName(input)).toBe(expected)
  })
  test('stays ASCII-only for any input', () => {
    expect(storageSafeName('Łódź 日本語 Ünï.pdf')).toMatch(/^[A-Za-z0-9._-]*$/)
  })
})

describe('toAsciiFilename', () => {
  test('keeps spaces, transliterates umlauts, replaces everything else non-ASCII', () => {
    expect(toAsciiFilename('Rechnung Müller Straße 3.pdf')).toBe('Rechnung Mueller Strasse 3.pdf')
    expect(toAsciiFilename('Café 日本.pdf')).toBe('Cafe __.pdf')
  })
  test('no quotes, backslashes or percent signs', () => {
    expect(toAsciiFilename('a"b\\c%d.pdf')).toBe('a_b_c_d.pdf')
  })
})

describe('buildFilename', () => {
  const ctx = { customer: 'Müller & Söhne GmbH', number: '2026-0001', issueDate: '2026-10-07' }
  test('keeps spaces and umlauts of the customer', () => {
    expect(buildFilename('Rechnung {Kunde} {Nr}', ctx, 'pdf')).toBe('Rechnung Müller & Söhne GmbH 2026-0001.pdf')
  })
  test('default template keeps its underscores', () => {
    expect(buildFilename('Rechnung_{Kunde}_{Nr}', ctx, 'pdf')).toBe('Rechnung_Müller & Söhne GmbH_2026-0001.pdf')
  })
  test('date and year placeholders', () => {
    expect(buildFilename('{Datum}_{Nr}', ctx, 'docx')).toBe('2026-10-07_2026-0001.docx')
    expect(buildFilename('{JJJJ} {Kunde}', ctx, 'pdf')).toBe('2026 Müller & Söhne GmbH.pdf')
  })
  test('forbidden characters become spaces and are collapsed', () => {
    expect(buildFilename('{JJJJ}/{Kunde}', { ...ctx, customer: 'A: B*C?"D"<E>|F\\G' }, 'pdf')).toBe('2026 A B C D E F G.pdf')
  })
  test('control characters are removed', () => {
    expect(buildFilename('{Kunde}', { ...ctx, customer: 'A\u0000B\tC\nD\u007fE' }, 'pdf')).toBe('A B C D E.pdf')
  })
  test('{Nr} replaces slashes by a hyphen', () => {
    expect(buildFilename('Rechnung {Nr}', { ...ctx, number: 'G1/26' }, 'pdf')).toBe('Rechnung G1-26.pdf')
    expect(buildFilename('Rechnung {Nr}', { ...ctx, number: 'A\\B' }, 'pdf')).toBe('Rechnung A-B.pdf')
  })
  test("owner's example pattern with range and per-customer counter", () => {
    const withRange = { customer: 'Hauptmann', number: 'M2/26', issueDate: '2026-10-07', rangeName: 'Metzgerei', customerSeq: 2 }
    expect(buildFilename('Rechnung {Kreis} {Kunde} {Zaehler}', withRange, 'pdf')).toBe('Rechnung Metzgerei Hauptmann 2.pdf')
  })
  test('empty {Kreis} leaves no double space', () => {
    const ctxNoRange = { customer: 'Hauptmann', number: 'M2/26', issueDate: '2026-10-07', rangeName: null, customerSeq: 2 }
    expect(buildFilename('Rechnung {Kreis} {Kunde} {Zaehler}', ctxNoRange, 'pdf')).toBe('Rechnung Hauptmann 2.pdf')
    expect(buildFilename('Rechnung {Kreis} {Kunde} {Zaehler}', { customer: 'Hauptmann', number: '1', issueDate: '2026-10-07' }, 'pdf')).toBe('Rechnung Hauptmann.pdf')
  })
  test('empty customer does not produce duplicate separators', () => {
    expect(buildFilename('Rechnung_{Kunde}_{Nr}', { ...ctx, customer: '' }, 'pdf')).toBe('Rechnung_2026-0001.pdf')
    expect(buildFilename('Rechnung {Kunde} {Nr}', { ...ctx, customer: '' }, 'pdf')).toBe('Rechnung 2026-0001.pdf')
  })
  test('completely empty -> fallback name', () => {
    expect(buildFilename('{Kunde}', { ...ctx, customer: '' }, 'pdf')).toBe('Rechnung.pdf')
    expect(buildFilename('{Kreis}', ctx, 'docx')).toBe('Rechnung.docx')
  })
  test('is truncated to 120 characters before the extension', () => {
    const name = buildFilename('{Kunde}', { ...ctx, customer: 'A'.repeat(300) }, 'pdf')
    expect(name).toBe(`${'A'.repeat(120)}.pdf`)
  })
  test('leading and trailing dots and spaces are stripped, text is NFC', () => {
    expect(buildFilename('..{Kunde}. .', { ...ctx, customer: 'Müller' }, 'pdf')).toBe('Müller.pdf')
    expect(buildFilename('{Kunde}', { ...ctx, customer: 'Müller' }, 'pdf').normalize('NFC')).toBe(buildFilename('{Kunde}', { ...ctx, customer: 'Müller' }, 'pdf'))
  })
  test('doubled separators inside substituted data are kept', () => {
    expect(buildFilename('Rechnung_{Kunde}_{Nr}', { ...ctx, customer: 'Müller--Söhne__GmbH' }, 'pdf')).toBe('Rechnung_Müller--Söhne__GmbH_2026-0001.pdf')
    expect(buildFilename('{Kunde}', { ...ctx, customer: '-Müller-' }, 'pdf')).toBe('-Müller-.pdf')
  })
  test('separators around empty placeholders are collapsed, also in the template itself', () => {
    expect(buildFilename('{Kreis}_{Kunde}_{Zaehler}_{Nr}', { ...ctx, customer: 'A--B' }, 'pdf')).toBe('A--B_2026-0001.pdf')
    expect(buildFilename('{Nr}_{Kreis}_', ctx, 'pdf')).toBe('2026-0001.pdf')
    expect(buildFilename('Rechnung__{Nr}', ctx, 'pdf')).toBe('Rechnung_2026-0001.pdf')
  })
  test('lone surrogates and bidi controls never reach the name (encodeURIComponent cannot throw)', () => {
    const hostile = 'A\uD800B\uDC00C\u202EDE\u2066F\u2069G😀'
    for (const name of [
      buildFilename('{Kunde}', { ...ctx, customer: hostile }, 'pdf'),
      buildFilename('x\uD800{Nr}', ctx, 'pdf'),
      normalizeUserFilename(hostile, 'pdf'),
    ]) {
      expect(() => encodeURIComponent(name)).not.toThrow()
      expect(name).not.toMatch(/[\u202A-\u202E\u2066-\u2069]/)
    }
    expect(buildFilename('{Kunde}', { ...ctx, customer: hostile }, 'pdf')).toBe('A B C DE F G😀.pdf')
  })
  test('other Unicode letters are kept', () => {
    expect(buildFilename('{Kunde}', { ...ctx, customer: 'Łódź Café 日本' }, 'pdf')).toBe('Łódź Café 日本.pdf')
  })
})

describe('normalizeUserFilename', () => {
  test.each([
    ['Meine Rechnung.pdf', 'pdf', 'Meine Rechnung.pdf'],
    ['Rechnung Müller 3', 'pdf', 'Rechnung Müller 3.pdf'],
    ['x.PDF', 'pdf', 'x.pdf'],
    ['Angebot', 'docx', 'Angebot.docx'],
    ['', 'pdf', 'Rechnung.pdf'],
    ['  a   b  ', 'pdf', 'a b.pdf'],
    ['a/b\\c:d*e?f"g<h>i|j', 'pdf', 'a b c d e f g h i j.pdf'],
    ['.hidden.', 'pdf', 'hidden.pdf'],
  ] as const)('%s (%s) -> %s', (input, ext, expected) => {
    expect(normalizeUserFilename(input, ext)).toBe(expected)
  })
})
