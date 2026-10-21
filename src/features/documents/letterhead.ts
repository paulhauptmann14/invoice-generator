import type { Theme } from '@/lib/domain/theme'
import type { DocumentLogo } from './logo'

/**
 * The version of a document for printing on letterhead paper, which already carries the logo and the business address
 * above the recipient: both are left out of this one document, the stored settings stay as they are.
 */
export function forLetterhead<T extends { theme: Theme; logo: DocumentLogo | null }>(doc: T): T {
  return { ...doc, logo: null, theme: { ...doc.theme, page: { ...doc.theme.page, senderLine: false } } }
}
