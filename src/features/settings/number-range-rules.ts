import { formatInvoiceNumber, validateNumberFormat } from '@/lib/domain/invoice-number'

type Range = { id: string; isDefault: boolean; archived: boolean }

/** Why a range may not be archived (German, shown to the user), or null if it may. */
export function archiveBlockReason(ranges: Range[], id: string): string | null {
  const target = ranges.find((r) => r.id === id)
  if (target?.isDefault) return 'Erst einen anderen Kreis als Standard festlegen.'
  const othersActive = ranges.some((r) => r.id !== id && !r.archived)
  return othersActive ? null : 'Mindestens ein Nummernkreis muss aktiv bleiben.'
}

/** The first number of a range in the given year, as an example next to the format ('' if invalid). */
export function exampleNumber(format: string, year: number): string {
  return validateNumberFormat(format) ? '' : formatInvoiceNumber(format, year, 1)
}
