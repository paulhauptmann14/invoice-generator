import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { imageInfo } from '@/lib/domain/image-info'
import type { Database } from '@/lib/supabase/database.types'
import { loadSettings, saveTheme } from './repository'

type Client = SupabaseClient<Database>

const MAX_BYTES = 2 * 1024 * 1024
const BUCKET = 'assets'

export type StoreLogoResult = { ok: true; path: string } | { ok: false; error: string }

/**
 * Stores a new logo under "<tenant>/logo-<timestamp>.<ext>" and points the theme at it.
 * Only real PNG/JPEG files are accepted (checked by content, not by name or browser type).
 * The previous logo is removed afterwards; if the theme cannot be saved, the new file is removed again.
 */
export async function storeLogo(supabase: Client, tenantId: string, file: Blob): Promise<StoreLogoResult> {
  if (file.size > MAX_BYTES) return { ok: false, error: 'Das Logo darf höchstens 2 MB groß sein.' }
  const data = new Uint8Array(await file.arrayBuffer())
  const info = imageInfo(data)
  if (!info) return { ok: false, error: 'Bitte ein PNG- oder JPEG-Bild hochladen.' }

  const path = `${tenantId}/logo-${Date.now()}.${info.type}`
  const bucket = supabase.storage.from(BUCKET)
  const { error: uploadError } = await bucket.upload(path, data, {
    contentType: info.type === 'png' ? 'image/png' : 'image/jpeg',
    upsert: false,
  })
  if (uploadError) {
    console.error('Logo upload failed', uploadError)
    return { ok: false, error: 'Das Logo konnte nicht gespeichert werden. Bitte erneut versuchen.' }
  }

  const { theme } = await loadSettings(supabase, tenantId)
  const previous = theme.logo.path
  try {
    await saveTheme(supabase, tenantId, { ...theme, logo: { ...theme.logo, path } })
  } catch (error) {
    console.error('Saving logo path failed', error)
    await bucket.remove([path])
    return { ok: false, error: 'Das Logo konnte nicht gespeichert werden. Bitte erneut versuchen.' }
  }
  if (previous && previous !== path && previous.startsWith(`${tenantId}/`)) {
    const { error } = await bucket.remove([previous])
    if (error) console.warn('Removing previous logo failed', error.message)
  }
  return { ok: true, path }
}

export async function removeLogo(supabase: Client, tenantId: string): Promise<void> {
  const { theme } = await loadSettings(supabase, tenantId)
  const path = theme.logo.path
  if (!path) return
  await saveTheme(supabase, tenantId, { ...theme, logo: { ...theme.logo, path: null } })
  if (path.startsWith(`${tenantId}/`)) {
    const { error } = await supabase.storage.from(BUCKET).remove([path])
    if (error) console.warn('Removing logo file failed', error.message)
  }
}
