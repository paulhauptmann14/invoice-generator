import { contentDisposition } from './content-disposition'

/** PDF response that is never cached and never sniffed. */
export function pdfResponse(pdf: Buffer, disposition?: { type: 'inline' | 'attachment'; filename: string }): Response {
  const headers: Record<string, string> = {
    'Content-Type': 'application/pdf',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  }
  if (disposition) headers['Content-Disposition'] = contentDisposition(disposition.type, disposition.filename)
  return new Response(new Uint8Array(pdf), { headers })
}
