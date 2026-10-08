import 'server-only'
import { renderToBuffer } from '@react-pdf/renderer'
import type { Theme } from '@/lib/domain/theme'
import type { InvoiceViewModel } from '@/lib/domain/view-model'
import { registerFonts } from './fonts'
import type { DocumentLogo } from './logo'
import { KlassischInvoice } from './layouts/klassisch'

/** Images loaded from storage for a document (logo); optional so previews and tests can omit them. */
export type RenderAssets = { logo?: DocumentLogo | null }

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the logo is used by the "Briefpapier" layout (next step)
export async function renderInvoicePdf(vm: InvoiceViewModel, theme: Theme, assets: RenderAssets = {}): Promise<Buffer> {
  const fontFamily = registerFonts(theme)
  // Only "klassisch" exists so far (IMPLEMENTED_LAYOUTS); other layouts fall back to it.
  return renderToBuffer(<KlassischInvoice vm={vm} theme={theme} fontFamily={fontFamily} />)
}
