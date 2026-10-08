import { contentDisposition } from './content-disposition'

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/** Generated documents are never cached and never sniffed. */
function fileResponse(file: Buffer, contentType: string, disposition?: string): Response {
  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  }
  if (disposition) headers['Content-Disposition'] = disposition
  return new Response(new Uint8Array(file), { headers })
}

export function pdfResponse(file: Buffer, disposition?: { type: 'inline' | 'attachment'; filename: string }): Response {
  return fileResponse(file, 'application/pdf', disposition && contentDisposition(disposition.type, disposition.filename))
}

/** Word files are always downloaded. */
export function docxResponse(file: Buffer, filename: string): Response {
  return fileResponse(file, DOCX_TYPE, contentDisposition('attachment', filename))
}
