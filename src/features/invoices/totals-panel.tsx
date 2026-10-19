import { formatEuro, formatVatRate } from '@/lib/domain/money'
import type { Discount, Totals } from '@/lib/domain/totals'
import { discountLabel } from '@/lib/domain/view-model'

const MINUS = '\u2212'

/** Summary like on the invoice: net and included VAT per rate, then the gross total. */
export function TotalsPanel({
  totals,
  invoiceDiscount = null,
}: {
  totals: Totals
  /** The applied invoice discount (from draftTotals); only used for the row label. */
  invoiceDiscount?: Discount
}) {
  return (
    <dl className="ml-auto w-full max-w-sm space-y-1.5 text-sm tabular-nums" aria-live="polite">
      {invoiceDiscount !== null && (
        <>
          <div className="flex justify-between">
            <dt>Zwischensumme</dt>
            <dd>{formatEuro(totals.subtotalCents)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>{discountLabel(invoiceDiscount)}</dt>
            <dd>
              {MINUS}
              {formatEuro(totals.invoiceDiscountCents)}
            </dd>
          </div>
        </>
      )}
      {totals.taxGroups.map((g) => {
        const rate = formatVatRate(g.rateBp / 100)
        return (
          <div key={g.rateBp} className="space-y-1.5 text-muted-foreground">
            <div className="flex justify-between">
              <dt>Nettobetrag {rate}</dt>
              <dd>{formatEuro(g.netCents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>enthaltene MwSt. {rate}</dt>
              <dd>{formatEuro(g.vatCents)}</dd>
            </div>
          </div>
        )
      })}
      <div className="flex justify-between border-t border-border pt-2 text-base font-medium text-foreground">
        <dt>Gesamtbetrag brutto</dt>
        <dd>{formatEuro(totals.grossCents)}</dd>
      </div>
    </dl>
  )
}
