import 'server-only'
import { renderToBuffer } from '@react-pdf/renderer'
import type { Theme } from '@/lib/domain/theme'
import type { InvoiceViewModel } from '@/lib/domain/view-model'
import { prepareFonts } from './fonts'
import { BriefpapierInvoice } from './layouts/briefpapier'
import { KlassischInvoice } from './layouts/klassisch'
import { ModernInvoice } from './layouts/modern'
import type { DocumentLogo } from './logo'

/** Images loaded from storage for a document (logo); optional so previews and tests can omit them. */
export type RenderAssets = { logo?: DocumentLogo | null }

export async function renderInvoicePdf(vm: InvoiceViewModel, theme: Theme, assets: RenderAssets = {}): Promise<Buffer> {
  const fontFamily = await prepareFonts(theme)
  switch (theme.layout) {
    case 'briefpapier':
      return renderToBuffer(<BriefpapierInvoice vm={vm} theme={theme} fontFamily={fontFamily} logo={assets.logo} />)
    case 'modern':
      return renderToBuffer(<ModernInvoice vm={vm} theme={theme} fontFamily={fontFamily} logo={assets.logo} />)
    case 'kompakt':
      return renderToBuffer(<KlassischInvoice vm={vm} theme={theme} fontFamily={fontFamily} density="compact" />)
    case 'klassisch':
      return renderToBuffer(<KlassischInvoice vm={vm} theme={theme} fontFamily={fontFamily} />)
  }
}
