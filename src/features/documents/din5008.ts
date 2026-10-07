// DIN 5008 letter layout (A4). Form A: low letterhead, Form B: high letterhead.
const POINTS_PER_MM = 72 / 25.4

export function mm(value: number): number {
  return value * POINTS_PER_MM
}

export function din5008(form: 'A' | 'B') {
  const isA = form === 'A'
  return {
    addressTopMm: isA ? 27 : 45,
    addressLeftMm: 20,
    addressWidthMm: 85,
    addressHeightMm: isA ? 40 : 45,
    // Top part of the address field (return address, endorsements); the recipient starts below it.
    endorsementZoneMm: isA ? 12.7 : 17.7,
    infoTopMm: isA ? 32 : 50,
    foldMarksMm: (isA ? [87, 192] : [105, 210]) as [number, number],
    punchMarkMm: 148.5,
  } as const
}
