import type { FilenameContext } from '@/lib/domain/filename'
import { DRAFT_LABEL } from '@/lib/domain/invoice-number'

type InvoiceForFilename = { number: string | null; issue_date: string; recipient: unknown; customer_seq?: number | null }

/** Everything the file name template needs, from a stored invoice and the name of its number range (null = none). */
export function filenameContextOf(invoice: InvoiceForFilename, rangeName: string | null): FilenameContext {
  const name = invoice.recipient && typeof invoice.recipient === 'object' ? (invoice.recipient as { name?: unknown }).name : undefined
  return {
    customer: typeof name === 'string' ? name.trim() : '',
    number: invoice.number ?? DRAFT_LABEL,
    issueDate: invoice.issue_date,
    rangeName,
    customerSeq: invoice.customer_seq ?? null,
  }
}
