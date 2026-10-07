import { inputFromPayload } from '@/features/documents/invoice-input'
import { loadDocumentSettings } from '@/features/documents/load-document-data'
import { pdfResponse } from '@/features/documents/pdf-response'
import { renderInvoicePdf } from '@/features/documents/render-invoice-pdf'
import { requireMemberForRoute } from '@/lib/auth/require-member'
import { todayIso } from '@/lib/domain/dates'
import { buildInvoiceViewModel } from '@/lib/domain/view-model'

const MAX_BODY_BYTES = 256 * 1024

/** Live preview of an unsaved draft. Nothing is stored. */
export async function POST(request: Request) {
  const auth = await requireMemberForRoute()
  if (auth.error) return auth.error

  const tooLarge = () => Response.json({ error: 'payload too large' }, { status: 413 })
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return tooLarge()
  const body = await request.text()
  if (Buffer.byteLength(body) > MAX_BODY_BYTES) return tooLarge()

  let payload: unknown
  try {
    payload = JSON.parse(body)
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 })
  }

  try {
    const settings = await loadDocumentSettings(auth.supabase)
    const vm = buildInvoiceViewModel(inputFromPayload(payload, todayIso()), settings.company, settings.theme)
    return pdfResponse(await renderInvoicePdf(vm, settings.theme))
  } catch (error) {
    console.error('Preview rendering failed', error)
    return Response.json({ error: 'render failed' }, { status: 500 })
  }
}
