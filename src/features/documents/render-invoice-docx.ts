import 'server-only'
import { Packer } from 'docx'
import type { Theme } from '@/lib/domain/theme'
import type { InvoiceViewModel } from '@/lib/domain/view-model'
import { resolveFontFamily } from './font-family'
import { buildKlassischDocx } from './layouts/klassisch-docx'

export async function renderInvoiceDocx(vm: InvoiceViewModel, theme: Theme): Promise<Buffer> {
  // Only "klassisch" exists so far (IMPLEMENTED_LAYOUTS); other layouts fall back to it.
  return Packer.toBuffer(buildKlassischDocx(vm, theme, resolveFontFamily(theme)))
}
