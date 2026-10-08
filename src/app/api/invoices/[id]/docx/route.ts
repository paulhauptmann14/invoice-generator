import { z } from 'zod'
import { docxResponse } from '@/features/documents/document-response'
import { loadInvoiceDocument } from '@/features/documents/load-document-data'
import { renderInvoiceDocx } from '@/features/documents/render-invoice-docx'
import { requireMemberForRoute } from '@/lib/auth/require-member'
import { normalizeUserFilename } from '@/lib/domain/filename'

type Params = { params: Promise<{ id: string }> }

const body = z.object({ filename: z.string().max(200) })

/** Editable Word version of a saved invoice. Not archived: the archived PDF is the record (spec 8). */
export async function POST(request: Request, { params }: Params) {
  const auth = await requireMemberForRoute()
  if (auth.error) return auth.error
  const { id } = await params
  if (!z.uuid().safeParse(id).success) return Response.json({ error: 'not found' }, { status: 404 })

  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'invalid body' }, { status: 400 })

  const doc = await loadInvoiceDocument(auth.supabase, id)
  if (!doc) return Response.json({ error: 'not found' }, { status: 404 })
  if (doc.missing.length > 0) {
    return Response.json({ error: 'company data incomplete', missing: doc.missing }, { status: 409 })
  }

  const filename = parsed.data.filename.trim() ? normalizeUserFilename(parsed.data.filename, 'docx') : doc.filenames.docx
  try {
    return docxResponse(await renderInvoiceDocx(doc.vm, doc.theme), filename)
  } catch (error) {
    console.error('DOCX rendering failed', error)
    return Response.json({ error: 'render failed' }, { status: 500 })
  }
}
