import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { imageInfo, type ImageInfo } from '@/lib/domain/image-info'
import type { Theme } from '@/lib/domain/theme'
import type { Database } from '@/lib/supabase/database.types'

export type DocumentLogo = ImageInfo & { data: Buffer }

/**
 * Loads the logo configured in the theme from the private "assets" bucket.
 * Missing or invalid files never block a document: it is rendered without logo (spec 10).
 */
export async function loadLogo(supabase: SupabaseClient<Database>, theme: Theme): Promise<DocumentLogo | null> {
  const path = theme.logo.path
  if (!path) return null
  const { data: blob, error } = await supabase.storage.from('assets').download(path)
  if (error || !blob) {
    console.warn('Logo could not be loaded; rendering without logo', error?.message)
    return null
  }
  const data = Buffer.from(await blob.arrayBuffer())
  const info = imageInfo(data)
  if (!info) {
    console.warn('Logo is not a PNG or JPEG; rendering without logo')
    return null
  }
  return { ...info, data }
}
