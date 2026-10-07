import { expect, test } from 'vitest'
import { din5008, mm } from './din5008'

test('mm converts to PDF points', () => {
  expect(mm(25.4)).toBeCloseTo(72)
  expect(mm(210)).toBeCloseTo(595.28, 1)
})

test('form A and B positions', () => {
  expect(din5008('A')).toMatchObject({ addressTopMm: 27, infoTopMm: 32, foldMarksMm: [87, 192] })
  expect(din5008('B')).toMatchObject({ addressTopMm: 45, infoTopMm: 50, foldMarksMm: [105, 210] })
  expect(din5008('B')).toMatchObject({ addressLeftMm: 20, addressWidthMm: 85, addressHeightMm: 45, punchMarkMm: 148.5 })
})

test('address field height and endorsement zone (return address sits above the recipient)', () => {
  expect(din5008('A')).toMatchObject({ addressHeightMm: 40, endorsementZoneMm: 12.7 })
  expect(din5008('B')).toMatchObject({ addressHeightMm: 45, endorsementZoneMm: 17.7 })
})
