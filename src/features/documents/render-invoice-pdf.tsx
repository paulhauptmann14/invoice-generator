import 'server-only'
import { renderToBuffer } from '@react-pdf/renderer'
import type { Theme } from '@/lib/domain/theme'
import type { InvoiceViewModel } from '@/lib/domain/view-model'
import { registerFonts } from './fonts'
import { BriefpapierInvoice } from './layouts/briefpapier'
import { KlassischInvoice } from './layouts/klassisch'
import type { DocumentLogo } from './logo'

/** Images loaded from storage for a document (logo); optional so previews and tests can omit them. */
export type RenderAssets = { logo?: DocumentLogo | null }

export async function renderInvoicePdf(vm: InvoiceViewModel, theme: Theme, assets: RenderAssets = {}): Promise<Buffer> {
  const fontFamily = registerFonts(theme)
  // Implemented layouts: "briefpapier" (default) and "klassisch"; "modern"/"kompakt" fall back to "klassisch".
  if (theme.layout === 'briefpapier') {
    return renderToBuffer(<BriefpapierInvoice vm={vm} theme={theme} fontFamily={fontFamily} logo={assets.logo} />)
  }
  return renderToBuffer(<KlassischInvoice vm={vm} theme={theme} fontFamily={fontFamily} />)
}
