import { z } from 'zod'
import { requireMemberForRoute } from '@/lib/auth/require-member'

type Params = { params: Promise<{ id: string; exportId: string }> }

/** Download an archived PDF via a short-lived signed URL (60 s). */
export async function GET(_request: Request, { params }: Params) {
  const auth = await requireMemberForRoute()
  if (auth.error) return auth.error
  const { id, exportId } = await params
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(exportId).success) {
    return Response.json({ error: 'not found' }, { status: 404 })
  }

  const { data: row, error: rowError } = await auth.supabase
    .from('invoice_exports')
    .select('storage_path, filename')
    .eq('id', exportId)
    .eq('invoice_id', id)
    .maybeSingle()
  if (rowError) {
    console.error('Loading export failed', rowError)
    return Response.json({ error: 'unavailable' }, { status: 502 })
  }
  if (!row) return Response.json({ error: 'not found' }, { status: 404 })

  const { data, error } = await auth.supabase.storage.from('invoice-pdfs').createSignedUrl(row.storage_path, 60, { download: row.filename })
  if (error || !data) {
    console.error('Signed URL failed', error)
    return Response.json({ error: 'unavailable' }, { status: 502 })
  }
  return Response.redirect(data.signedUrl, 303)
}
