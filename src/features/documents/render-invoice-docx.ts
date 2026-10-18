import 'server-only'
import { Packer } from 'docx'
import type { Theme } from '@/lib/domain/theme'
import type { InvoiceViewModel } from '@/lib/domain/view-model'
import { resolveFontFamily } from './font-family'
import { buildBriefpapierDocx } from './layouts/briefpapier-docx'
import { buildKlassischDocx } from './layouts/klassisch-docx'
import { buildModernDocx } from './layouts/modern-docx'
import type { RenderAssets } from './render-invoice-pdf'

export async function renderInvoiceDocx(vm: InvoiceViewModel, theme: Theme, assets: RenderAssets = {}): Promise<Buffer> {
  const fontFamily = resolveFontFamily(theme)
  switch (theme.layout) {
    case 'briefpapier':
      return Packer.toBuffer(buildBriefpapierDocx(vm, theme, fontFamily, assets.logo))
    case 'modern':
      return Packer.toBuffer(buildModernDocx(vm, theme, fontFamily, assets.logo))
    case 'kompakt':
      return Packer.toBuffer(buildKlassischDocx(vm, theme, fontFamily, 'compact'))
    case 'klassisch':
      return Packer.toBuffer(buildKlassischDocx(vm, theme, fontFamily))
  }
}
