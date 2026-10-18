import type { Theme } from '@/lib/domain/theme'
import { din5008 } from '../din5008'
import type { DocumentLogo } from '../logo'

const PAGE_WIDTH_MM = 210
const PT_MM = 25.4 / 72
const NAME_LINE_HEIGHT = 1.1
// Average advance of a bold sans glyph in em; used to keep the company name on one line (estimate, errs wide).
const NAME_GLYPH_EM = 0.6
const MIN_NAME_PT = 10

/**
 * Head of the layout "Modern" (PDF and Word share it): company name, accent rule and logo, in mm/pt.
 * The name shrinks (down to 10 pt) so it stays on one line above the rule; the logo is capped to the head height.
 */
export function modernHead(theme: Theme, logo: Pick<DocumentLogo, 'width' | 'height'> | null, companyName: string) {
  const { page } = theme
  const din = din5008(page.din5008)
  // Room between the top margin and the address field (form A starts at 27 mm, so the head is short there).
  const headRoomMm = Math.max(0, din.addressTopMm - 3 - page.marginTopMm)
  const baseOffsetMm = Math.min(16, headRoomMm)

  const maxLogoHeightMm = baseOffsetMm - 3
  let logoWidthMm = 0
  let logoHeightMm = 0
  if (logo && logo.width > 0 && logo.height > 0 && maxLogoHeightMm > 0) {
    logoWidthMm = theme.logo.widthMm
    logoHeightMm = (logoWidthMm * logo.height) / logo.width
    if (logoHeightMm > maxLogoHeightMm) {
      logoHeightMm = maxLogoHeightMm
      logoWidthMm = (maxLogoHeightMm * logo.width) / logo.height
    }
  }

  const contentWidthMm = PAGE_WIDTH_MM - page.marginLeftMm - page.marginRightMm
  const nameWidthMm = contentWidthMm - (logoWidthMm > 0 ? logoWidthMm + 6 : 0)
  const byHeight = (baseOffsetMm - 2) / (NAME_LINE_HEIGHT * PT_MM)
  const byWidth = nameWidthMm / (NAME_GLYPH_EM * Math.max(1, companyName.length) * PT_MM)
  const nameSizePt = Math.max(MIN_NAME_PT, Math.floor(Math.min(theme.font.headingSizePt * 1.25, byHeight, byWidth) * 2) / 2)
  // The rule always sits below the name, even when large margins leave no room above the address field.
  const ruleTopMm = page.marginTopMm + Math.max(baseOffsetMm, nameSizePt * NAME_LINE_HEIGHT * PT_MM + 2)

  return { nameSizePt, nameWidthMm, ruleTopMm, logoWidthMm, logoHeightMm }
}
