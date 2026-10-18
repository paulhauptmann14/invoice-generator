import { loadLogo } from '@/features/documents/logo'
import { removeLogo, storeLogo } from '@/features/settings/logo-store'
import { loadSettings } from '@/features/settings/repository'
import { requireTenantForRoute } from '@/lib/auth/require-tenant'

type Params = { params: Promise<{ betrieb: string }> }

// Multipart overhead on top of the 2 MB file limit (checked again on the file itself).
const MAX_REQUEST_BYTES = 2 * 1024 * 1024 + 64 * 1024

/**
 * Current logo for the settings page. Served from this origin (the CSP allows images from 'self' only,
 * and no storage URL leaves the server); private, never cached.
 */
export async function GET(_request: Request, { params }: Params) {
  const auth = await requireTenantForRoute((await params).betrieb)
  if (auth.error) return auth.error
  const { theme } = await loadSettings(auth.supabase, auth.tenant.id)
  const logo = await loadLogo(auth.supabase, auth.tenant.id, theme)
  if (!logo) return Response.json({ error: 'not found' }, { status: 404 })
  return new Response(new Uint8Array(logo.data), {
    headers: {
      'Content-Type': logo.type === 'png' ? 'image/png' : 'image/jpeg',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

/** Upload (multipart field "file"). Errors carry a German message for the settings form. */
export async function POST(request: Request, { params }: Params) {
  const auth = await requireTenantForRoute((await params).betrieb)
  if (auth.error) return auth.error
  if (Number(request.headers.get('content-length') ?? 0) > MAX_REQUEST_BYTES) {
    return Response.json({ error: 'Das Logo darf höchstens 2 MB groß sein.' }, { status: 413 })
  }

  const file = (await request.formData().catch(() => null))?.get('file')
  if (!(file instanceof Blob)) return Response.json({ error: 'Bitte eine Bilddatei auswählen.' }, { status: 400 })

  const result = await storeLogo(auth.supabase, auth.tenant.id, file)
  if (!result.ok) return Response.json({ error: result.error }, { status: 422 })
  return Response.json({ ok: true })
}

export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireTenantForRoute((await params).betrieb)
  if (auth.error) return auth.error
  try {
    await removeLogo(auth.supabase, auth.tenant.id)
  } catch (error) {
    console.error('Removing logo failed', error)
    return Response.json({ error: 'Das Logo konnte nicht entfernt werden.' }, { status: 502 })
  }
  return Response.json({ ok: true })
}
