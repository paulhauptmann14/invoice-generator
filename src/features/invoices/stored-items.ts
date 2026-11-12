import { discountFromColumns, type LineInput } from '@/lib/domain/totals'
import type { InvoiceLineInput } from '@/lib/domain/view-model'

/** The columns of an invoice_items row that the totals need. */
export type StoredAmounts = {
  kind: string
  quantity: number | null
  unit_price_gross: number | null
  vat_rate: number | null
  discount_kind: string | null
  discount_value: number | null
}

/** An invoice_items row as the documents need it. */
export type StoredItem = StoredAmounts & { description: string; unit: string }

/** Items carry a price and a VAT rate (the database enforces it); headings carry neither. */
export function isPricedItem<T extends StoredAmounts>(row: T): row is T & { unit_price_gross: number; vat_rate: number } {
  return row.kind !== 'heading' && row.unit_price_gross !== null && row.vat_rate !== null
}

/** Stored rows as lines for the totals: headings are left out. */
export function storedLines(rows: StoredAmounts[]): LineInput[] {
  return rows.filter(isPricedItem).map((row) => ({
    quantity: row.quantity === null ? null : Number(row.quantity),
    unitPriceGross: Number(row.unit_price_gross),
    vatRate: Number(row.vat_rate),
    discount: discountFromColumns(row.discount_kind, row.discount_value),
  }))
}

/** Stored rows (already in print order) as document lines: items and the headings between them. */
export function storedLineInputs(rows: StoredItem[]): InvoiceLineInput[] {
  return rows.flatMap((row): InvoiceLineInput[] => {
    if (row.kind === 'heading') return [{ kind: 'heading', description: row.description }]
    if (!isPricedItem(row)) return []
    return [
      {
        description: row.description,
        quantity: row.quantity === null ? null : Number(row.quantity),
        unit: row.unit,
        unitPriceGross: Number(row.unit_price_gross),
        vatRate: Number(row.vat_rate),
        discount: discountFromColumns(row.discount_kind, row.discount_value),
      },
    ]
  })
}
