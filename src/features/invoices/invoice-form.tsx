'use client'

import { CircleAlert, Info } from 'lucide-react'
import Link from 'next/link'
import { useActionState, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { FieldError } from '@/components/field-error'
import { FormAlert } from '@/components/form-alert'
import { useTenant } from '@/features/tenants/tenant-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { RequiredMark } from '@/components/form/required-mark'
import { addDays, formatDateDe } from '@/lib/domain/dates'
import { type InvoiceFormState, saveInvoice } from './actions'
import { createDraftReducer, draftTotals, type InvoiceDraft, type NumberContext, type PickerArticle, type PickerCustomer, recipientNotice, toPayload } from './draft'
import { useReportDirty } from './editor-context'
import { ItemsEditor } from './items-editor'
import { PreviewToggle, usePreviewMode, WithPreview } from './with-preview'
import { RecipientSection } from './recipient-section'
import { TotalsPanel } from './totals-panel'

const initialState: InvoiceFormState = { message: null, errors: {}, suggestedNumber: null }

export function InvoiceForm({
  id,
  initialDraft,
  numberContext,
  customers,
  articles,
}: {
  id: string | null
  initialDraft: InvoiceDraft
  numberContext: NumberContext
  customers: PickerCustomer[]
  articles: PickerArticle[]
}) {
  const { tenant, path, api } = useTenant()
  const reducer = useMemo(() => createDraftReducer(numberContext), [numberContext])
  const [draft, dispatch] = useReducer(reducer, initialDraft)
  // Archived ranges stay selectable only for an invoice that already uses them.
  const rangeChoices = numberContext.ranges.filter((r) => !r.archived || r.id === draft.numberRangeId)
  const [state, action, pending] = useActionState(saveInvoice.bind(null, tenant.id, id), initialState)
  const formRef = useRef<HTMLFormElement>(null)
  const { totals, invalidKeys, lineTotals } = draftTotals(draft)
  const notice = recipientNotice(draft, totals.grossCents)
  // Baseline from the first render: a router.refresh() passes a new (equal) initialDraft object, which must not
  // count as a change. After a save the page remounts the form (key), which resets the baseline.
  const [pristine] = useState(initialDraft)
  const dirty = draft !== pristine
  useReportDirty(dirty)
  const payloadJson = useMemo(() => JSON.stringify(toPayload(draft)), [draft])
  // Side-by-side preview from 80rem; below that it opens in a full-screen dialog.
  const preview = usePreviewMode('rechnung-vorschau')

  // Focus the first invalid control after a failed save.
  useEffect(() => {
    const first = Object.keys(state.errors)[0]
    if (first) document.getElementById(`inv-${first}`)?.focus()
  }, [state])

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    if (!dirty || pending) return
    const handler = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty, pending])

  const err = state.errors
  const days = draft.paymentDays.trim()
  const dueDate = /^\d{1,3}$/.test(days) && /^\d{4}-\d{2}-\d{2}$/.test(draft.issueDate) ? formatDateDe(addDays(draft.issueDate, Number(days))) : null

  const previewUrl = api('invoices/preview')
  const previewToggle = <PreviewToggle mode={preview} url={previewUrl} payload={payloadJson} />

  const form = (
    <form ref={formRef} action={action} noValidate className="space-y-10">
      <input type="hidden" name="payload" value={payloadJson} />
      {state.message && (
        <FormAlert>
          {state.message}
          {state.suggestedNumber && (
            <>
              {' '}
              <button type="button" className="font-medium underline underline-offset-4" onClick={() => dispatch({ type: 'setField', field: 'number', value: state.suggestedNumber! })}>
                {state.suggestedNumber} verwenden
              </button>
            </>
          )}
        </FormAlert>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="text-stamp">*</span> Pflichtfeld
        </p>
        {previewToggle}
      </div>

      <div className="grid gap-10 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <RecipientSection draft={draft} dispatch={dispatch} customers={customers} errors={err} />

        <fieldset className="space-y-5">
          <legend className="font-display text-xl font-semibold">Rechnung</legend>
          {rangeChoices.length > 1 && (
            <div className="space-y-1.5">
              <Label htmlFor="inv-numberRange">Nummernkreis</Label>
              <NativeSelect
                id="inv-numberRange"
                value={draft.numberRangeId ?? ''}
                onChange={(e) => dispatch({ type: 'setNumberRange', id: e.target.value || null })}
              >
                {draft.numberRangeId === null && <option value="">Ohne (manuelle Nummer)</option>}
                {rangeChoices.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.archived ? `${r.name} (archiviert)` : r.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="inv-number">
              Rechnungsnummer
              <RequiredMark />
            </Label>
            <Input id="inv-number" value={draft.number} onChange={(e) => dispatch({ type: 'setField', field: 'number', value: e.target.value })} aria-invalid={Boolean(err.number)} aria-required className="font-mono" />
            {err.number && <FieldError id="inv-number-error">{err.number}</FieldError>}
          </div>
          <div className="grid gap-5 @lg:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="inv-issueDate">
                Rechnungsdatum
                <RequiredMark />
              </Label>
              <Input id="inv-issueDate" type="date" value={draft.issueDate} onChange={(e) => dispatch({ type: 'setField', field: 'issueDate', value: e.target.value })} aria-invalid={Boolean(err.issueDate)} aria-required />
              {err.issueDate && <FieldError id="inv-issueDate-error">{err.issueDate}</FieldError>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-paymentDays">Zahlungsziel (Tage)</Label>
              <Input id="inv-paymentDays" inputMode="numeric" value={draft.paymentDays} onChange={(e) => dispatch({ type: 'setField', field: 'paymentDays', value: e.target.value })} aria-invalid={Boolean(err.paymentDays)} aria-describedby="inv-due" />
              <p id="inv-due" className="text-sm text-muted-foreground">
                {dueDate ? `Fällig am ${dueDate}` : days === '' ? 'Leer = kein Fälligkeitsdatum auf der Rechnung.' : 'Fällig am –'}
              </p>
              {err.paymentDays && <FieldError id="inv-paymentDays-error">{err.paymentDays}</FieldError>}
            </div>
          </div>
          <div className="grid gap-5 @lg:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="inv-serviceDateFrom">
                {draft.serviceDateTo === null ? 'Leistungsdatum' : 'Leistung von'}
                <RequiredMark />
              </Label>
              <Input id="inv-serviceDateFrom" type="date" value={draft.serviceDateFrom} onChange={(e) => dispatch({ type: 'setField', field: 'serviceDateFrom', value: e.target.value })} aria-invalid={Boolean(err.serviceDateFrom)} aria-required />
              {err.serviceDateFrom && <FieldError id="inv-serviceDateFrom-error">{err.serviceDateFrom}</FieldError>}
            </div>
            {draft.serviceDateTo !== null && (
              <div className="space-y-1.5">
                <Label htmlFor="inv-serviceDateTo">
                  Leistung bis
                  <RequiredMark />
                </Label>
                <Input id="inv-serviceDateTo" type="date" value={draft.serviceDateTo} onChange={(e) => dispatch({ type: 'setServiceDateTo', value: e.target.value })} aria-invalid={Boolean(err.serviceDateTo)} aria-required />
                {err.serviceDateTo && <FieldError id="inv-serviceDateTo-error">{err.serviceDateTo}</FieldError>}
              </div>
            )}
          </div>
          <label className="flex min-h-11 items-center gap-3 text-sm md:min-h-9">
            <input type="checkbox" checked={draft.serviceDateTo !== null} onChange={(e) => dispatch({ type: 'setServiceDateTo', value: e.target.checked ? draft.serviceDateFrom : null })} className="size-4 accent-[var(--color-tinte)]" />
            Leistungszeitraum statt einzelnem Datum
          </label>
        </fieldset>
      </div>

      {notice && (
        <p role="status" className={['flex items-start gap-2 rounded-md border px-3 py-2.5 text-sm', notice.level === 'warning' ? 'border-stamp/40 bg-stamp/5 text-stamp' : 'border-border bg-card text-muted-foreground'].join(' ')}>
          {notice.level === 'warning' ? <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" /> : <Info aria-hidden className="mt-0.5 size-4 shrink-0" />}
          {notice.text}
        </p>
      )}

      <ItemsEditor items={draft.items} lineTotals={lineTotals} invalidKeys={invalidKeys} articles={articles} dispatch={dispatch} errors={err} />
      <TotalsPanel totals={totals} />

      <fieldset className="space-y-5">
        <legend className="font-display text-xl font-semibold">Texte</legend>
        <div className="space-y-1.5">
          <Label htmlFor="inv-introText">Einleitung</Label>
          <Textarea id="inv-introText" rows={2} value={draft.introText} onChange={(e) => dispatch({ type: 'setField', field: 'introText', value: e.target.value })} aria-describedby="inv-placeholders" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="inv-closingText">Schlusstext</Label>
          <Textarea id="inv-closingText" rows={2} value={draft.closingText} onChange={(e) => dispatch({ type: 'setField', field: 'closingText', value: e.target.value })} aria-describedby="inv-placeholders" />
        </div>
        <p id="inv-placeholders" className="text-sm text-muted-foreground">
          Platzhalter: {'{Nr}'}, {'{Kunde}'}, {'{Datum}'}, {'{Leistungsdatum}'}, {'{Faellig}'}, {'{Betrag}'}
        </p>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-6">
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {pending ? 'Speichern …' : id ? 'Änderungen speichern' : 'Rechnung speichern'}
        </Button>
        <Button asChild variant="ghost">
          <Link href={path('rechnungen')}>Abbrechen</Link>
        </Button>
      </div>
    </form>
  )

  return (
    <WithPreview mode={preview} url={previewUrl} payload={payloadJson}>
      {form}
    </WithPreview>
  )
}
