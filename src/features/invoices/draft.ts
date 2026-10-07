import { parseGermanDecimal, formatDecimalInput } from '@/lib/domain/decimal'
import { yearOf } from '@/lib/domain/dates'
import { suggestNextNumber } from '@/lib/domain/invoice-number'
import { calcLineTotalCents, calcTotals, type LineInput, type Totals } from '@/lib/domain/totals'

// Client-side invoice draft: every editable value is kept as the string shown in its input.

export type DraftRecipient = {
  name: string
  contactPerson: string
  street: string
  postalCode: string
  city: string
  countryCode: string
  vatId: string
}

export type DraftItem = {
  key: string
  description: string
  quantity: string
  unit: string
  unitPriceGross: string
  vatRate: string
  articleId: string | null
  saveAsArticle: boolean
}

export type InvoiceDraft = {
  number: string
  numberEdited: boolean
  customerId: string | null
  saveAsCustomer: boolean
  recipient: DraftRecipient
  issueDate: string
  serviceDateFrom: string
  serviceDateTo: string | null
  paymentDays: string
  introText: string
  closingText: string
  items: DraftItem[]
}

export type PickerCustomer = {
  id: string
  name: string
  contactPerson: string | null
  street: string
  postalCode: string
  city: string
  countryCode: string
  vatId: string | null
}

export type PickerArticle = {
  id: string
  name: string
  description: string | null
  unit: string
  unitPriceGross: number
  vatRate: number
}

export type NumberContext = { format: string | null; existing: string[] }

type TextField = 'number' | 'issueDate' | 'serviceDateFrom' | 'paymentDays' | 'introText' | 'closingText'
type ItemField = 'description' | 'quantity' | 'unit' | 'unitPriceGross' | 'vatRate'

export type DraftAction =
  | { type: 'setField'; field: TextField; value: string }
  | { type: 'setServiceDateTo'; value: string | null }
  | { type: 'setRecipient'; field: keyof DraftRecipient; value: string }
  | { type: 'selectCustomer'; customer: PickerCustomer }
  | { type: 'clearCustomer' }
  | { type: 'setSaveAsCustomer'; value: boolean }
  | { type: 'addArticle'; key: string; article: PickerArticle }
  | { type: 'addFreeItem'; key: string }
  | { type: 'updateItem'; key: string; field: ItemField; value: string }
  | { type: 'setSaveAsArticle'; key: string; value: boolean }
  | { type: 'removeItem'; key: string }
  | { type: 'moveItem'; key: string; direction: -1 | 1 }

const emptyRecipient = (): DraftRecipient => ({ name: '', contactPerson: '', street: '', postalCode: '', city: '', countryCode: 'DE', vatId: '' })

const freeItem = (key: string): DraftItem => ({
  key,
  description: '',
  quantity: '1',
  unit: '',
  unitPriceGross: '',
  vatRate: '7',
  articleId: null,
  saveAsArticle: false,
})

export function newDraft(opts: {
  today: string
  numberContext: NumberContext
  /** Default payment term from the settings; null = new invoices start without a due date. */
  paymentDays: number | null
  introText: string
  closingText: string
  firstItemKey?: string
}): InvoiceDraft {
  return {
    number: suggestNextNumber(opts.numberContext.format, yearOf(opts.today), opts.numberContext.existing),
    numberEdited: false,
    customerId: null,
    saveAsCustomer: false,
    recipient: emptyRecipient(),
    issueDate: opts.today,
    serviceDateFrom: opts.today,
    serviceDateTo: null,
    paymentDays: opts.paymentDays === null ? '' : String(opts.paymentDays),
    introText: opts.introText,
    closingText: opts.closingText,
    items: [freeItem(opts.firstItemKey ?? 'item-1')],
  }
}

export type InvoiceRecordWithItems = {
  number: string
  customer_id: string | null
  recipient: unknown
  issue_date: string
  service_date_from: string
  service_date_to: string | null
  payment_days: number | null
  intro_text: string | null
  closing_text: string | null
  invoice_items: {
    id: string
    position: number
    description: string
    quantity: number
    unit: string
    unit_price_gross: number
    vat_rate: number
    article_id: string | null
  }[]
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function draftFromInvoice(invoice: InvoiceRecordWithItems): InvoiceDraft {
  const r = (invoice.recipient ?? {}) as Record<string, unknown>
  return {
    number: invoice.number,
    numberEdited: true,
    customerId: invoice.customer_id,
    saveAsCustomer: false,
    recipient: {
      name: str(r.name),
      contactPerson: str(r.contactPerson),
      street: str(r.street),
      postalCode: str(r.postalCode),
      city: str(r.city),
      countryCode: str(r.countryCode) || 'DE',
      vatId: str(r.vatId),
    },
    issueDate: invoice.issue_date,
    serviceDateFrom: invoice.service_date_from,
    serviceDateTo: invoice.service_date_to,
    paymentDays: invoice.payment_days === null ? '' : String(invoice.payment_days),
    introText: invoice.intro_text ?? '',
    closingText: invoice.closing_text ?? '',
    items: [...invoice.invoice_items]
      .sort((a, b) => a.position - b.position)
      .map((i) => ({
        key: i.id,
        description: i.description,
        quantity: String(i.quantity).replace('.', ','),
        unit: i.unit,
        unitPriceGross: formatDecimalInput(i.unit_price_gross),
        vatRate: String(Number(i.vat_rate)),
        articleId: i.article_id,
        saveAsArticle: false,
      })),
  }
}

function isUntouched(item: DraftItem): boolean {
  return item.articleId === null && item.description.trim() === '' && item.unitPriceGross.trim() === '' && item.unit.trim() === ''
}

export function createDraftReducer(ctx: NumberContext) {
  return function draftReducer(state: InvoiceDraft, action: DraftAction): InvoiceDraft {
    switch (action.type) {
      case 'setField': {
        if (action.field === 'number') return { ...state, number: action.value, numberEdited: true }
        if (action.field === 'issueDate') {
          const next = { ...state, issueDate: action.value }
          // Re-suggest the number when the year changes, unless it was typed by hand.
          if (!state.numberEdited && /^\d{4}-/.test(action.value) && action.value.slice(0, 4) !== state.issueDate.slice(0, 4)) {
            next.number = suggestNextNumber(ctx.format, Number(action.value.slice(0, 4)), ctx.existing)
          }
          return next
        }
        return { ...state, [action.field]: action.value }
      }
      case 'setServiceDateTo':
        return { ...state, serviceDateTo: action.value }
      case 'setRecipient':
        return { ...state, recipient: { ...state.recipient, [action.field]: action.value } }
      case 'selectCustomer': {
        const c = action.customer
        return {
          ...state,
          customerId: c.id,
          saveAsCustomer: false,
          recipient: {
            name: c.name,
            contactPerson: c.contactPerson ?? '',
            street: c.street,
            postalCode: c.postalCode,
            city: c.city,
            countryCode: c.countryCode,
            vatId: c.vatId ?? '',
          },
        }
      }
      case 'clearCustomer':
        return { ...state, customerId: null, saveAsCustomer: false, recipient: emptyRecipient() }
      case 'setSaveAsCustomer':
        return { ...state, saveAsCustomer: action.value }
      case 'addArticle': {
        const a = action.article
        const item: DraftItem = {
          key: action.key,
          description: a.description ? `${a.name}\n${a.description}` : a.name,
          quantity: '1',
          unit: a.unit,
          unitPriceGross: formatDecimalInput(a.unitPriceGross),
          vatRate: String(a.vatRate),
          articleId: a.id,
          saveAsArticle: false,
        }
        // The starter line of a new invoice is replaced as long as nothing was typed into it.
        const kept = state.items.filter((i) => !isUntouched(i))
        return { ...state, items: [...kept, item] }
      }
      case 'addFreeItem':
        return { ...state, items: [...state.items, freeItem(action.key)] }
      case 'updateItem':
        return {
          ...state,
          items: state.items.map((i) => (i.key === action.key ? { ...i, [action.field]: action.value } : i)),
        }
      case 'setSaveAsArticle':
        return {
          ...state,
          items: state.items.map((i) => (i.key === action.key ? { ...i, saveAsArticle: action.value } : i)),
        }
      case 'removeItem':
        return { ...state, items: state.items.filter((i) => i.key !== action.key) }
      case 'moveItem': {
        const index = state.items.findIndex((i) => i.key === action.key)
        const target = index + action.direction
        if (index < 0 || target < 0 || target >= state.items.length) return state
        const items = [...state.items]
        ;[items[index], items[target]] = [items[target], items[index]]
        return { ...state, items }
      }
    }
  }
}

/** What the server receives: the draft without client-only fields (numberEdited, item keys). */
export function toPayload(draft: InvoiceDraft) {
  return {
    number: draft.number,
    customerId: draft.customerId,
    saveAsCustomer: draft.saveAsCustomer,
    recipient: draft.recipient,
    issueDate: draft.issueDate,
    serviceDateFrom: draft.serviceDateFrom,
    serviceDateTo: draft.serviceDateTo,
    paymentDays: draft.paymentDays,
    introText: draft.introText,
    closingText: draft.closingText,
    items: draft.items.map((i) => ({
      description: i.description,
      quantity: i.quantity,
      unit: i.unit,
      unitPriceGross: i.unitPriceGross,
      vatRate: i.vatRate,
      articleId: i.articleId,
      saveAsArticle: i.saveAsArticle,
    })),
  }
}

/**
 * Live totals for the form. Lines whose price or quantity cannot be parsed count as 0;
 * they are reported as invalid once a price was typed (a fresh, empty line is just incomplete).
 */
export function draftTotals(draft: InvoiceDraft): { totals: Totals; invalidKeys: string[]; lineTotals: Map<string, number> } {
  const lines: LineInput[] = []
  const invalidKeys: string[] = []
  const lineTotals = new Map<string, number>()
  for (const item of draft.items) {
    const quantity = parseGermanDecimal(item.quantity)
    const price = parseGermanDecimal(item.unitPriceGross)
    if (quantity === null || price === null) {
      if (item.unitPriceGross.trim() !== '') invalidKeys.push(item.key)
      continue
    }
    const line = { quantity, unitPriceGross: price, vatRate: Number(item.vatRate) || 0 }
    lines.push(line)
    lineTotals.set(item.key, calcLineTotalCents(line))
  }
  return { totals: calcTotals(lines), invalidKeys, lineTotals }
}

const SMALL_INVOICE_LIMIT_CENTS = 25000

/** § 14 UStG: full recipient address is mandatory above 250 EUR (small-amount invoices are exempt). */
export function recipientNotice(draft: InvoiceDraft, grossCents: number): { level: 'warning' | 'info'; text: string } | null {
  const r = draft.recipient
  const complete = r.name.trim() && r.street.trim() && r.postalCode.trim() && r.city.trim()
  if (complete) return null
  if (Math.abs(grossCents) > SMALL_INVOICE_LIMIT_CENTS) {
    return { level: 'warning', text: 'Über 250 € ist die vollständige Anschrift des Empfängers Pflicht (§ 14 UStG).' }
  }
  return { level: 'info', text: 'Ohne vollständige Anschrift nur als Kleinbetragsrechnung bis 250 € zulässig.' }
}
