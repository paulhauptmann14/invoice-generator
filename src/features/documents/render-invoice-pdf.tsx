import 'server-only'
import { type DocumentProps, renderToBuffer } from '@react-pdf/renderer'
import type { Theme } from '@/lib/domain/theme'
import type { InvoiceViewModel } from '@/lib/domain/view-model'
import { prepareFonts } from './fonts'
import { BriefpapierInvoice } from './layouts/briefpapier'
import { KlassischInvoice } from './layouts/klassisch'
import { ModernInvoice } from './layouts/modern'
import type { DocumentLogo } from './logo'

/** Images loaded from storage for a document (logo); optional so previews and tests can omit them. */
export type RenderAssets = { logo?: DocumentLogo | null }
/** `conformance`: a PDF/A level, e.g. for a ZUGFeRD invoice; plain PDF without. */
export type RenderOptions = { conformance?: DocumentProps['conformance'] }

export async function renderInvoicePdf(vm: InvoiceViewModel, theme: Theme, assets: RenderAssets = {}, { conformance }: RenderOptions = {}): Promise<Buffer> {
  const fontFamily = await prepareFonts(theme)
  switch (theme.layout) {
    case 'briefpapier':
      return renderToBuffer(<BriefpapierInvoice vm={vm} theme={theme} fontFamily={fontFamily} logo={assets.logo} conformance={conformance} />)
    case 'modern':
      return renderToBuffer(<ModernInvoice vm={vm} theme={theme} fontFamily={fontFamily} logo={assets.logo} conformance={conformance} />)
    case 'kompakt':
      return renderToBuffer(<KlassischInvoice vm={vm} theme={theme} fontFamily={fontFamily} density="compact" conformance={conformance} />)
    case 'klassisch':
      return renderToBuffer(<KlassischInvoice vm={vm} theme={theme} fontFamily={fontFamily} conformance={conformance} />)
  }
}
