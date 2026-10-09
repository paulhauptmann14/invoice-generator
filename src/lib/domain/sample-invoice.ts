import type { InvoiceInput } from './view-model'

/** Fixed example invoice for the settings preview: two VAT rates, so the whole tax block is visible. */
export function sampleInvoice(opts: { today: string; number: string; paymentDays: number | null }): InvoiceInput {
  return {
    number: opts.number,
    issueDate: opts.today,
    serviceDateFrom: opts.today,
    serviceDateTo: null,
    paymentDays: opts.paymentDays,
    recipient: {
      name: 'Musterkunde GmbH',
      contactPerson: 'Frau Beispiel',
      street: 'Musterweg 12',
      postalCode: '12345',
      city: 'Musterstadt',
      countryCode: 'DE',
      vatId: null,
    },
    introText: null,
    closingText: null,
    items: [
      { description: 'Mittagsbuffet', quantity: 20, unit: 'Pers.', unitPriceGross: 24.9, vatRate: 7 },
      { description: 'Getränkepauschale', quantity: 20, unit: 'Pers.', unitPriceGross: 9.5, vatRate: 19 },
    ],
  }
}
