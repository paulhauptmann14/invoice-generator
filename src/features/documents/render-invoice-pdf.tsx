import 'server-only'
import { renderToBuffer } from '@react-pdf/renderer'
import type { Theme } from '@/lib/domain/theme'
import type { InvoiceViewModel } from '@/lib/domain/view-model'
import { registerFonts } from './fonts'
import { KlassischInvoice } from './layouts/klassisch'

export async function renderInvoicePdf(vm: InvoiceViewModel, theme: Theme): Promise<Buffer> {
  const fontFamily = registerFonts(theme)
  // Only "klassisch" exists so far (IMPLEMENTED_LAYOUTS); other layouts fall back to it.
  return renderToBuffer(<KlassischInvoice vm={vm} theme={theme} fontFamily={fontFamily} />)
}
