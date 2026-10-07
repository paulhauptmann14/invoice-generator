import { z } from 'zod'
import { loadInvoiceDocument } from '@/features/documents/load-document-data'
import { pdfResponse } from '@/features/documents/pdf-response'
import { renderInvoicePdf } from '@/features/documents/render-invoice-pdf'
import { requireMemberForRoute } from '@/lib/auth/require-member'
import { normalizeUserFilename } from '@/lib/domain/filename'

type Params = { params: Promise<{ id: string }> }

const notFound = () => Response.json({ error: 'not found' }, { status: 404 })

/** Preview of a saved invoice (inline, not archived). */
export async function GET(_request: Request, { params }: Params) {
  const auth = await requireMemberForRoute()
  if (auth.error) return auth.error
  const { id } = await params
  if (!z.uuid().safeParse(id).success) return notFound()

  const doc = await loadInvoiceDocument(auth.supabase, id)
  if (!doc) return notFound()
  return pdfResponse(await renderInvoicePdf(doc.vm, doc.theme), { type: 'inline', filename: doc.filename })
}

const exportBody = z.object({ filename: z.string().max(200) })

/** Export: render, archive in storage + invoice_exports, then download. No download without archive. */
export async function POST(request: Request, { params }: Params) {
  const auth = await requireMemberForRoute()
  if (auth.error) return auth.error
  const { id } = await params
  if (!z.uuid().safeParse(id).success) return notFound()

  const parsedBody = exportBody.safeParse(await request.json().catch(() => null))
  if (!parsedBody.success) return Response.json({ error: 'invalid body' }, { status: 400 })

  const doc = await loadInvoiceDocument(auth.supabase, id)
  if (!doc) return notFound()
  if (doc.missing.length > 0) {
    return Response.json({ error: 'company data incomplete', missing: doc.missing }, { status: 409 })
  }

  const filename = parsedBody.data.filename.trim() ? normalizeUserFilename(parsedBody.data.filename, 'pdf') : doc.filename
  const pdf = await renderInvoicePdf(doc.vm, doc.theme)
  const storagePath = `${id}/${new Date().toISOString().replace(/[:.]/g, '-')}_${filename}`
  const bucket = auth.supabase.storage.from('invoice-pdfs')

  const { error: uploadError } = await bucket.upload(storagePath, pdf, { contentType: 'application/pdf', upsert: false })
  if (uploadError) {
    console.error('PDF archive upload failed', uploadError)
    return Response.json({ error: 'archive failed' }, { status: 502 })
  }
  const { error: insertError } = await auth.supabase.from('invoice_exports').insert({ invoice_id: id, storage_path: storagePath, filename })
  if (insertError) {
    console.error('invoice_exports insert failed', insertError)
    // Roll back the upload so storage never holds an unlisted archive file.
    await bucket.remove([storagePath])
    return Response.json({ error: 'archive failed' }, { status: 502 })
  }
  return pdfResponse(pdf, { type: 'attachment', filename })
}
