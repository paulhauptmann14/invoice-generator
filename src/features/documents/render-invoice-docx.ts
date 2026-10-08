import 'server-only'
import { Packer } from 'docx'
import type { Theme } from '@/lib/domain/theme'
import type { InvoiceViewModel } from '@/lib/domain/view-model'
import { resolveFontFamily } from './font-family'
import { buildKlassischDocx } from './layouts/klassisch-docx'
import type { RenderAssets } from './render-invoice-pdf'

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the logo is used by the "Briefpapier" layout (next step)
export async function renderInvoiceDocx(vm: InvoiceViewModel, theme: Theme, assets: RenderAssets = {}): Promise<Buffer> {
  // Only "klassisch" exists so far (IMPLEMENTED_LAYOUTS); other layouts fall back to it.
  return Packer.toBuffer(buildKlassischDocx(vm, theme, resolveFontFamily(theme)))
}
