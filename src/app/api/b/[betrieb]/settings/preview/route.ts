import { z } from 'zod'
import { pdfResponse } from '@/features/documents/document-response'
import { loadLogo } from '@/features/documents/logo'
import { renderInvoicePdf } from '@/features/documents/render-invoice-pdf'
import { defaultRange } from '@/features/invoices/draft'
import { listNumberRanges } from '@/features/invoices/queries'
import { applyAppearanceForm, applyCompanyForm, applyPaymentForm } from '@/features/settings/merge'
import { exampleNumber } from '@/features/settings/number-range-rules'
import { loadSettings } from '@/features/settings/repository'
import { appearanceFormSchema, companyFormSchema, paymentFormSchema } from '@/features/settings/schemas'
import { requireTenantForRoute } from '@/lib/auth/require-tenant'
import { todayIso, yearOf } from '@/lib/domain/dates'
import { sampleInvoice } from '@/lib/domain/sample-invoice'
import { buildInvoiceViewModel } from '@/lib/domain/view-model'

const MAX_BODY_BYTES = 256 * 1024
const body = z.object({ tab: z.enum(['firma', 'zahlung', 'erscheinungsbild']), form: z.unknown() })

type Params = { params: Promise<{ betrieb: string }> }

/** Sample invoice rendered with the unsaved values of a settings tab. Nothing is stored. */
export async function POST(request: Request, { params }: Params) {
  const auth = await requireTenantForRoute((await params).betrieb)
  if (auth.error) return auth.error

  const tooLarge = () => Response.json({ error: 'payload too large' }, { status: 413 })
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return tooLarge()
  const text = await request.text()
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) return tooLarge()

  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 })
  }
  const parsedBody = body.safeParse(raw)
  if (!parsedBody.success) return Response.json({ error: 'invalid body' }, { status: 400 })

  const [settings, ranges] = await Promise.all([loadSettings(auth.supabase, auth.tenant.id), listNumberRanges(auth.supabase, auth.tenant.id)])
  let { company, theme } = settings
  let paymentDays = settings.defaultPaymentDays
  const { tab, form } = parsedBody.data
  // Invalid form values: 422, the preview keeps showing the last valid state.
  const invalid = () => Response.json({ error: 'invalid form' }, { status: 422 })
  if (tab === 'firma') {
    const parsed = companyFormSchema.safeParse(form)
    if (!parsed.success) return invalid()
    company = applyCompanyForm(company, parsed.data)
  } else if (tab === 'zahlung') {
    const parsed = paymentFormSchema.safeParse(form)
    if (!parsed.success) return invalid()
    const next = applyPaymentForm(company, theme, parsed.data)
    company = next.company
    theme = next.theme
    paymentDays = next.defaultPaymentDays
  } else {
    const parsed = appearanceFormSchema.safeParse(form)
    if (!parsed.success) return invalid()
    theme = applyAppearanceForm(theme, parsed.data)
  }

  try {
    const today = todayIso()
    const format = defaultRange(ranges)?.format ?? '{JJJJ}-{NNNN}'
    const input = sampleInvoice({ today, number: exampleNumber(format, yearOf(today)) || 'Muster-1', paymentDays })
    const vm = buildInvoiceViewModel(input, company, theme)
    return pdfResponse(await renderInvoicePdf(vm, theme, { logo: await loadLogo(auth.supabase, auth.tenant.id, theme) }))
  } catch (error) {
    console.error('Settings preview rendering failed', error)
    return Response.json({ error: 'render failed' }, { status: 500 })
  }
}
