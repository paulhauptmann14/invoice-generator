import { parseGermanDecimal, formatDecimalInput } from '@/lib/domain/decimal'
import { yearOf } from '@/lib/domain/dates'
import { suggestNextNumber } from '@/lib/domain/invoice-number'
import { calcTotals, discountFromColumns, type Discount, type DiscountKind, type LineInput, type Totals } from '@/lib/domain/totals'
import { discountSchema, invoiceDiscountIssue, itemDiscountIssue } from './schema'

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
  /** null = no discount; the value is the text typed into the input. */
  discountKind: DiscountKind | null
  discountValue: string
}

export type InvoiceDraft = {
  /** null = manual number (no range). */
  numberRangeId: string | null
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
  /** Discount on the whole invoice: null = none. */
  discountKind: DiscountKind | null
  discountValue: string
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

export type NumberRangeChoice = { id: string; name: string; format: string; archived: boolean; isDefault: boolean }

/** The tenant's number ranges and all its existing invoice numbers (for the next-number suggestion). */
export type NumberContext = { ranges: NumberRangeChoice[]; existing: string[] }

export function defaultRange(ranges: NumberRangeChoice[]): NumberRangeChoice | null {
  return ranges.find((r) => r.isDefault && !r.archived) ?? ranges.find((r) => !r.archived) ?? null
}

/** Next number of a range for the year of the given date; '' without a range (manual entry). */
export function suggestForRange(ctx: NumberContext, rangeId: string | null, isoDate: string): string {
  const format = ctx.ranges.find((r) => r.id === rangeId)?.format ?? null
  return suggestNextNumber(format, yearOf(isoDate), ctx.existing)
}

type TextField = 'number' | 'issueDate' | 'serviceDateFrom' | 'paymentDays' | 'introText' | 'closingText'
type ItemField = 'description' | 'quantity' | 'unit' | 'unitPriceGross' | 'vatRate'

export type DraftAction =
  | { type: 'setField'; field: TextField; value: string }
  | { type: 'setNumberRange'; id: string | null }
  | { type: 'setServiceDateTo'; value: string | null }
  | { type: 'setRecipient'; field: keyof DraftRecipient; value: string }
  | { type: 'selectCustomer'; customer: PickerCustomer }
  | { type: 'clearCustomer' }
  | { type: 'setSaveAsCustomer'; value: boolean }
  | { type: 'addArticle'; key: string; article: PickerArticle }
  | { type: 'addFreeItem'; key: string }
  | { type: 'updateItem'; key: string; field: ItemField; value: string }
  | { type: 'setSaveAsArticle'; key: string; value: boolean }
  /** kind null removes the discount (the value is reset to ''). */
  | { type: 'setItemDiscountKind'; key: string; kind: DiscountKind | null }
  | { type: 'setItemDiscountValue'; key: string; value: string }
  | { type: 'setInvoiceDiscountKind'; kind: DiscountKind | null }
  | { type: 'setInvoiceDiscountValue'; value: string }
  | { type: 'removeItem'; key: string }
  /** Undo of a removal: puts the item back at its old index (clamped to the list). */
  | { type: 'restoreItem'; item: DraftItem; index: number }
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
  discountKind: null,
  discountValue: '',
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
  const rangeId = defaultRange(opts.numberContext.ranges)?.id ?? null
  return {
    numberRangeId: rangeId,
    number: suggestForRange(opts.numberContext, rangeId, opts.today),
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
    discountKind: null,
    discountValue: '',
    items: [freeItem(opts.firstItemKey ?? 'item-1')],
  }
}

export type InvoiceRecordWithItems = {
  number: string
  number_range_id: string | null
  customer_id: string | null
  recipient: unknown
  issue_date: string
  service_date_from: string
  service_date_to: string | null
  payment_days: number | null
  intro_text: string | null
  closing_text: string | null
  discount_kind: string | null
  discount_value: number | null
  invoice_items: {
    id: string
    position: number
    description: string
    quantity: number
    unit: string
    unit_price_gross: number
    vat_rate: number
    article_id: string | null
    discount_kind: string | null
    discount_value: number | null
  }[]
}

/** Stored discount columns -> draft fields; unknown kinds count as no discount. Percent without trailing zeros ("12,5"). */
function discountFields(kind: string | null, value: number | null): { discountKind: DiscountKind | null; discountValue: string } {
  const discount = discountFromColumns(kind, value)
  if (discount === null) return { discountKind: null, discountValue: '' }
  const number = Number(discount.value)
  return {
    discountKind: discount.kind,
    discountValue: discount.kind === 'percent' ? String(number).replace('.', ',') : formatDecimalInput(number),
  }
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function draftFromInvoice(invoice: InvoiceRecordWithItems): InvoiceDraft {
  const r = (invoice.recipient ?? {}) as Record<string, unknown>
  return {
    numberRangeId: invoice.number_range_id,
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
    ...discountFields(invoice.discount_kind, invoice.discount_value),
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
        ...discountFields(i.discount_kind, i.discount_value),
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
            next.number = suggestForRange(ctx, state.numberRangeId, action.value)
          }
          return next
        }
        return { ...state, [action.field]: action.value }
      }
      case 'setNumberRange':
        // Like the year change: a number typed by hand is never replaced.
        return {
          ...state,
          numberRangeId: action.id,
          number: state.numberEdited || action.id === null ? state.number : suggestForRange(ctx, action.id, state.issueDate),
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
          discountKind: null,
          discountValue: '',
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
      case 'setItemDiscountKind':
        return {
          ...state,
          items: state.items.map((i) =>
            i.key === action.key ? { ...i, discountKind: action.kind, discountValue: action.kind === null ? '' : i.discountValue } : i,
          ),
        }
      case 'setItemDiscountValue':
        return {
          ...state,
          items: state.items.map((i) => (i.key === action.key ? { ...i, discountValue: action.value } : i)),
        }
      case 'setInvoiceDiscountKind':
        return { ...state, discountKind: action.kind, discountValue: action.kind === null ? '' : state.discountValue }
      case 'setInvoiceDiscountValue':
        return { ...state, discountValue: action.value }
      case 'removeItem':
        return { ...state, items: state.items.filter((i) => i.key !== action.key) }
      case 'restoreItem': {
        if (state.items.some((i) => i.key === action.item.key)) return state
        const items = [...state.items]
        items.splice(Math.min(Math.max(action.index, 0), items.length), 0, action.item)
        return { ...state, items }
      }
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
    numberRangeId: draft.numberRangeId,
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
    discount: draft.discountKind === null ? null : { kind: draft.discountKind, value: draft.discountValue },
    items: draft.items.map((i) => ({
      description: i.description,
      quantity: i.quantity,
      unit: i.unit,
      unitPriceGross: i.unitPriceGross,
      vatRate: i.vatRate,
      articleId: i.articleId,
      saveAsArticle: i.saveAsArticle,
      discount: i.discountKind === null ? null : { kind: i.discountKind, value: i.discountValue },
    })),
  }
}

/**
 * A typed discount as a Discount for the totals, checked with the same schema as the server.
 * '' = not entered yet (no discount, no message); anything else that the schema rejects yields its
 * message and no discount. Limits that depend on the amount are checked by the caller.
 */
function readDiscount(kind: DiscountKind | null, text: string): { discount: Discount; message: string | null } {
  if (kind === null || text.trim() === '') return { discount: null, message: null }
  const parsed = discountSchema.safeParse({ kind, value: text })
  if (!parsed.success) return { discount: null, message: parsed.error.issues[0]?.message ?? null }
  return { discount: parsed.data, message: null }
}

/**
 * Live totals for the form. Lines whose price or quantity cannot be parsed count as 0;
 * they are reported as invalid once a price was typed (a fresh, empty line is just incomplete).
 * A discount counts only when the server would accept it (same schema and amount rules); otherwise
 * its line is marked invalid, the discount is left out and its message is reported.
 */
export function draftTotals(draft: InvoiceDraft): {
  totals: Totals
  invalidKeys: string[]
  /** After the item discount. */
  lineTotals: Map<string, number>
  lineDiscounts: Map<string, number>
  /** The invoice discount that is applied in `totals`; null when absent or unusable. */
  invoiceDiscount: Discount
  /** Why an item discount is not applied, by item key. */
  discountMessages: Map<string, string>
  /** Why the invoice discount is not applied; null when fine or not entered yet. */
  invoiceDiscountMessage: string | null
} {
  const lines: LineInput[] = []
  const lineKeys: string[] = []
  const invalidKeys: string[] = []
  const discountMessages = new Map<string, string>()
  let itemDiscountFailed = false
  for (const item of draft.items) {
    const typed = readDiscount(item.discountKind, item.discountValue)
    const quantity = parseGermanDecimal(item.quantity)
    const price = parseGermanDecimal(item.unitPriceGross)
    if (quantity === null || price === null) {
      if (item.unitPriceGross.trim() !== '') invalidKeys.push(item.key)
      if (typed.message !== null) discountMessages.set(item.key, typed.message)
      continue
    }
    const line: LineInput = { quantity, unitPriceGross: price, vatRate: Number(item.vatRate) || 0 }
    const withDiscount = typed.discount ? { ...line, discount: typed.discount } : line
    const message = typed.message ?? itemDiscountIssue(withDiscount)
    if (message !== null) {
      discountMessages.set(item.key, message)
      itemDiscountFailed = true
      invalidKeys.push(item.key)
      lines.push(line)
    } else {
      lines.push(withDiscount)
    }
    lineKeys.push(item.key)
  }

  let totals = calcTotals(lines)
  const typedInvoice = readDiscount(draft.discountKind, draft.discountValue)
  let invoiceDiscount: Discount = null
  let invoiceDiscountMessage = typedInvoice.message
  // Like the server: the invoice discount is only judged once every item discount is fine.
  if (typedInvoice.discount && !itemDiscountFailed) {
    const issue = invoiceDiscountIssue(lines, typedInvoice.discount)
    if (issue === null) {
      invoiceDiscount = typedInvoice.discount
      totals = calcTotals(lines, invoiceDiscount)
    } else {
      invoiceDiscountMessage = issue
    }
  }

  const lineTotals = new Map<string, number>()
  const lineDiscounts = new Map<string, number>()
  lineKeys.forEach((key, i) => {
    lineTotals.set(key, totals.lineTotalsCents[i])
    lineDiscounts.set(key, totals.lineDiscountsCents[i])
  })
  return { totals, invalidKeys, lineTotals, lineDiscounts, invoiceDiscount, discountMessages, invoiceDiscountMessage }
}

/** Small-amount invoices (Kleinbetragsrechnung, § 33 UStDV) go up to 250,00 EUR gross. */
export const SMALL_INVOICE_LIMIT_CENTS = 25000

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
