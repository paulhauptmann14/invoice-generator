import { z } from 'zod'
import { requireTenantForRoute } from '@/lib/auth/require-tenant'

type Params = { params: Promise<{ betrieb: string; id: string; exportId: string }> }

/** Download an archived PDF via a short-lived signed URL (60 s). */
export async function GET(_request: Request, { params }: Params) {
  const { betrieb, id, exportId } = await params
  const auth = await requireTenantForRoute(betrieb)
  if (auth.error) return auth.error
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(exportId).success) {
    return Response.json({ error: 'not found' }, { status: 404 })
  }

  const { data: row, error: rowError } = await auth.supabase
    .from('invoice_exports')
    .select('storage_path, filename')
    .eq('id', exportId)
    .eq('tenant_id', auth.tenant.id)
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
