'use client'

import { CircleAlert, Eye, EyeOff, Info, X } from 'lucide-react'
import Link from 'next/link'
import { useActionState, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { FieldError } from '@/components/field-error'
import { FormAlert } from '@/components/form-alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { addDays, formatDateDe } from '@/lib/domain/dates'
import { useMediaQuery } from '@/lib/use-media-query'
import { useStoredFlag } from '@/lib/use-stored-flag'
import { type InvoiceFormState, saveInvoice } from './actions'
import { createDraftReducer, draftTotals, type InvoiceDraft, type NumberContext, type PickerArticle, type PickerCustomer, recipientNotice, toPayload } from './draft'
import { useReportDirty } from './editor-context'
import { ItemsEditor } from './items-editor'
import { LivePreview } from './live-preview'
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
  const reducer = useMemo(() => createDraftReducer(numberContext), [numberContext])
  const [draft, dispatch] = useReducer(reducer, initialDraft)
  const [state, action, pending] = useActionState(saveInvoice.bind(null, id), initialState)
  const formRef = useRef<HTMLFormElement>(null)
  const { totals, invalidKeys, lineTotals } = draftTotals(draft)
  const notice = recipientNotice(draft, totals.grossCents)
  // Baseline from the first render: a router.refresh() passes a new (equal) initialDraft object, which must not
  // count as a change. After a save the page remounts the form (key), which resets the baseline.
  const [pristine] = useState(initialDraft)
  const dirty = draft !== pristine
  useReportDirty(dirty)
  const payloadJson = useMemo(() => JSON.stringify(toPayload(draft)), [draft])
  // Side-by-side preview from 80rem (Tailwind xl, 1280px); below that it opens in a full-screen dialog.
  const wide = useMediaQuery('(min-width: 80rem)')
  const [previewOn, setPreviewOn] = useStoredFlag('rechnung-vorschau', true)
  const sidePreview = wide && previewOn

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

  const previewToggle = wide ? (
    <Button type="button" variant="outline" className="gap-2" onClick={() => setPreviewOn(!previewOn)}>
      {previewOn ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
      {previewOn ? 'Vorschau ausblenden' : 'Vorschau einblenden'}
    </Button>
  ) : (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="gap-2">
          <Eye aria-hidden className="size-4" />
          Vorschau
        </Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        className="inset-0 top-0 left-0 flex h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-3 overflow-y-auto rounded-none border-0 bg-background p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:max-w-none sm:p-6"
      >
        <div className="flex items-center justify-between gap-3">
          <DialogTitle className="font-display text-xl font-semibold">Vorschau</DialogTitle>
          <DialogClose asChild>
            <Button type="button" variant="outline" className="min-h-11 gap-2 md:min-h-9">
              <X aria-hidden className="size-4" />
              Schließen
            </Button>
          </DialogClose>
        </div>
        <LivePreview payload={payloadJson} showLabel={false} className="mx-auto w-full max-w-2xl" />
      </DialogContent>
    </Dialog>
  )

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
          <div className="space-y-1.5">
            <Label htmlFor="inv-number">
              Rechnungsnummer<span aria-hidden className="text-stamp"> *</span>
            </Label>
            <Input id="inv-number" value={draft.number} onChange={(e) => dispatch({ type: 'setField', field: 'number', value: e.target.value })} aria-invalid={Boolean(err.number)} aria-required className="font-mono" />
            {err.number && <FieldError id="inv-number-error">{err.number}</FieldError>}
          </div>
          <div className="grid gap-5 @lg:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="inv-issueDate">Rechnungsdatum</Label>
              <Input id="inv-issueDate" type="date" value={draft.issueDate} onChange={(e) => dispatch({ type: 'setField', field: 'issueDate', value: e.target.value })} aria-invalid={Boolean(err.issueDate)} />
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
              <Label htmlFor="inv-serviceDateFrom">{draft.serviceDateTo === null ? 'Leistungsdatum' : 'Leistung von'}</Label>
              <Input id="inv-serviceDateFrom" type="date" value={draft.serviceDateFrom} onChange={(e) => dispatch({ type: 'setField', field: 'serviceDateFrom', value: e.target.value })} aria-invalid={Boolean(err.serviceDateFrom)} />
              {err.serviceDateFrom && <FieldError id="inv-serviceDateFrom-error">{err.serviceDateFrom}</FieldError>}
            </div>
            {draft.serviceDateTo !== null && (
              <div className="space-y-1.5">
                <Label htmlFor="inv-serviceDateTo">Leistung bis</Label>
                <Input id="inv-serviceDateTo" type="date" value={draft.serviceDateTo} onChange={(e) => dispatch({ type: 'setServiceDateTo', value: e.target.value })} aria-invalid={Boolean(err.serviceDateTo)} />
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
          Platzhalter: {'{Nr}'}, {'{Kunde}'}, {'{Datum}'}, {'{Faellig}'}, {'{Betrag}'}
        </p>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-6">
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {pending ? 'Speichern …' : id ? 'Änderungen speichern' : 'Rechnung speichern'}
        </Button>
        <Button asChild variant="ghost">
          <Link href="/rechnungen">Abbrechen</Link>
        </Button>
      </div>
    </form>
  )

  // data-wide lets the app shell widen the content area for the editor (see (app)/layout.tsx).
  return (
    <div data-wide className={sidePreview ? 'mt-8 grid grid-cols-[minmax(0,1fr)_minmax(22rem,40%)] items-start gap-10' : 'mt-8'}>
      {/* Container queries: the form adapts to its own width, which shrinks next to the preview. */}
      <div className="@container min-w-0">{form}</div>
      {sidePreview && <LivePreview payload={payloadJson} className="sticky top-6" frameClassName="aspect-[210/297] max-h-[calc(100dvh-6rem)]" />}
    </div>
  )
}
