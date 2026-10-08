import 'server-only'
import { Packer } from 'docx'
import type { Theme } from '@/lib/domain/theme'
import type { InvoiceViewModel } from '@/lib/domain/view-model'
import { resolveFontFamily } from './font-family'
import { buildBriefpapierDocx } from './layouts/briefpapier-docx'
import { buildKlassischDocx } from './layouts/klassisch-docx'
import type { RenderAssets } from './render-invoice-pdf'

export async function renderInvoiceDocx(vm: InvoiceViewModel, theme: Theme, assets: RenderAssets = {}): Promise<Buffer> {
  const fontFamily = resolveFontFamily(theme)
  // Implemented layouts: "briefpapier" (default) and "klassisch"; "modern"/"kompakt" fall back to "klassisch".
  if (theme.layout === 'briefpapier') return Packer.toBuffer(buildBriefpapierDocx(vm, theme, fontFamily, assets.logo))
  return Packer.toBuffer(buildKlassischDocx(vm, theme, fontFamily))
}
