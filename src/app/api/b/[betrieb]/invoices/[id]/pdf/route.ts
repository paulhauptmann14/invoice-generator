import { z } from 'zod'
import { forLetterhead } from '@/features/documents/letterhead'
import { loadInvoiceDocument } from '@/features/documents/load-document-data'
import { pdfResponse } from '@/features/documents/document-response'
import { renderInvoicePdf } from '@/features/documents/render-invoice-pdf'
import { loadMissingRecipientAddress, recipientAddressMessage } from '@/features/invoices/recipient-address'
import { requireTenantForRoute } from '@/lib/auth/require-tenant'
import { normalizeUserFilename, storageSafeName } from '@/lib/domain/filename'

type Params = { params: Promise<{ betrieb: string; id: string }> }

const notFound = () => Response.json({ error: 'not found' }, { status: 404 })

// Above 250 EUR the recipient's address is mandatory (§ 14 UStG); the message is German for the UI.
const recipientIncomplete = (recipientMissing: string[]) =>
  Response.json(
    { error: 'recipient address incomplete', recipientMissing, message: recipientAddressMessage(recipientMissing) },
    { status: 409 },
  )

/** Preview of a saved invoice (inline, not archived); also what "Drucken" prints. `?letterhead=1`: the letterhead version. */
export async function GET(request: Request, { params }: Params) {
  const { betrieb, id } = await params
  const auth = await requireTenantForRoute(betrieb)
  if (auth.error) return auth.error
  if (!z.uuid().safeParse(id).success) return notFound()

  // An invoice of another tenant is not found (spec 3a).
  const loaded = await loadInvoiceDocument(auth.supabase, auth.tenant.id, id)
  if (!loaded) return notFound()
  const recipientMissing = await loadMissingRecipientAddress(auth.supabase, auth.tenant.id, id)
  if (recipientMissing.length > 0) return recipientIncomplete(recipientMissing)
  const doc = new URL(request.url).searchParams.get('letterhead') === '1' ? forLetterhead(loaded) : loaded
  return pdfResponse(await renderInvoicePdf(doc.vm, doc.theme, { logo: doc.logo }), { type: 'inline', filename: doc.filenames.pdf })
}

// letterhead: for printing on letterhead paper that already carries the logo and the sender line.
const exportBody = z.object({ filename: z.string().max(200), letterhead: z.boolean().optional() })

/** Export: render, archive in storage + invoice_exports, then download. No download without archive. */
export async function POST(request: Request, { params }: Params) {
  const { betrieb, id } = await params
  const auth = await requireTenantForRoute(betrieb)
  if (auth.error) return auth.error
  if (!z.uuid().safeParse(id).success) return notFound()

  const parsedBody = exportBody.safeParse(await request.json().catch(() => null))
  if (!parsedBody.success) return Response.json({ error: 'invalid body' }, { status: 400 })

  const loaded = await loadInvoiceDocument(auth.supabase, auth.tenant.id, id)
  if (!loaded) return notFound()
  const doc = parsedBody.data.letterhead ? forLetterhead(loaded) : loaded
  const recipientMissing = await loadMissingRecipientAddress(auth.supabase, auth.tenant.id, id)
  if (doc.missing.length > 0) {
    return Response.json({ error: 'company data incomplete', missing: doc.missing, recipientMissing }, { status: 409 })
  }
  if (recipientMissing.length > 0) return recipientIncomplete(recipientMissing)

  const filename = parsedBody.data.filename.trim() ? normalizeUserFilename(parsedBody.data.filename, 'pdf') : doc.filenames.pdf
  const pdf = await renderInvoicePdf(doc.vm, doc.theme, { logo: doc.logo })
  // Object keys stay ASCII-safe; the readable name lives in invoice_exports.filename.
  const storagePath = `${auth.tenant.id}/${id}/${new Date().toISOString().replace(/[:.]/g, '-')}_${storageSafeName(filename)}`
  const bucket = auth.supabase.storage.from('invoice-pdfs')

  const { error: uploadError } = await bucket.upload(storagePath, pdf, { contentType: 'application/pdf', upsert: false })
  if (uploadError) {
    console.error('PDF archive upload failed', uploadError)
    return Response.json({ error: 'archive failed' }, { status: 502 })
  }
  const { error: insertError } = await auth.supabase.from('invoice_exports').insert({ tenant_id: auth.tenant.id, invoice_id: id, storage_path: storagePath, filename })
  if (insertError) {
    console.error('invoice_exports insert failed', insertError)
    // Roll back the upload so storage never holds an unlisted archive file.
    await bucket.remove([storagePath])
    return Response.json({ error: 'archive failed' }, { status: 502 })
  }
  return pdfResponse(pdf, { type: 'attachment', filename })
}
