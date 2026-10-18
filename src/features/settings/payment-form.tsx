'use client'

import { Plus, Trash2 } from 'lucide-react'
import { RequiredNote } from '@/components/form/field'
import { Button } from '@/components/ui/button'
import { PreviewToggle, usePreviewMode, WithPreview } from '@/features/invoices/with-preview'
import { useTenant } from '@/features/tenants/tenant-context'
import { savePaymentSettings } from './actions'
import { ErrorSummary, SaveBar, TextAreaField, TextField } from './fields'
import { type PaymentFormInput, paymentFormSchema } from './schemas'
import { useSettingsForm } from './use-settings-form'

const legend = 'font-display text-xl font-semibold'
const MAX_ACCOUNTS = 3
const emptyAccount = { bankName: '', accountNumber: '', iban: '', bic: '' }

export function PaymentForm({ initial }: { initial: PaymentFormInput }) {
  const { tenant, api } = useTenant()
  const form = useSettingsForm({ initial, schema: paymentFormSchema, action: savePaymentSettings.bind(null, tenant.id) })
  const preview = usePreviewMode('einstellungen-vorschau')
  const previewUrl = api('settings/preview')
  const previewPayload = JSON.stringify({ tab: 'zahlung', form: form.draft })
  const accounts = form.draft.bankAccounts

  function removeAccount(index: number) {
    form.clearErrors('bankAccounts')
    form.update((d) => ({ ...d, bankAccounts: d.bankAccounts.filter((_, i) => i !== index) }))
  }

  return (
    <WithPreview mode={preview} url={previewUrl} payload={previewPayload}>
      <form action={form.formAction} noValidate className="space-y-10">
        <input type="hidden" name="payload" value={form.payload} />
        <ErrorSummary form={form} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <RequiredNote />
          <PreviewToggle mode={preview} url={previewUrl} payload={previewPayload} />
        </div>

        <section aria-labelledby="bank-heading" className="space-y-6">
          <div>
            <h2 id="bank-heading" className={legend}>
              Bankverbindungen
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">Bis zu drei, in dieser Reihenfolge unter dem Zahlungstext.</p>
          </div>
          {accounts.length === 0 && <p className="text-sm text-muted-foreground">Noch keine Bankverbindung hinterlegt.</p>}
          {accounts.map((_, index) => (
            <fieldset key={index} className="space-y-5 rounded-md border border-border bg-card p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <legend className="float-left text-base font-medium">Bankverbindung {index + 1}</legend>
                <Button type="button" variant="ghost" className="gap-2 text-muted-foreground" onClick={() => removeAccount(index)} aria-label={`Bankverbindung ${index + 1} entfernen`}>
                  <Trash2 aria-hidden className="size-4" />
                  Entfernen
                </Button>
              </div>
              <div className="clear-both grid gap-5 @lg:grid-cols-2">
                <TextField form={form} path={`bankAccounts.${index}.bankName`} label="Bank" autoComplete="off" />
                <TextField form={form} path={`bankAccounts.${index}.accountNumber`} label="Kontonummer" autoComplete="off" hint="Optional, nur wenn sie auf der Rechnung stehen soll." />
              </div>
              <div className="grid gap-5 @lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <TextField form={form} path={`bankAccounts.${index}.iban`} label="IBAN" required autoComplete="off" spellCheck={false} className="[&_input]:font-mono" />
                <TextField form={form} path={`bankAccounts.${index}.bic`} label="BIC" autoComplete="off" spellCheck={false} className="[&_input]:font-mono" />
              </div>
            </fieldset>
          ))}
          {accounts.length < MAX_ACCOUNTS && (
            <Button type="button" variant="outline" className="gap-2" onClick={() => form.update((d) => ({ ...d, bankAccounts: [...d.bankAccounts, { ...emptyAccount }] }))}>
              <Plus aria-hidden className="size-4" />
              Bankverbindung hinzufügen
            </Button>
          )}
        </section>

        <fieldset className="space-y-5">
          <legend className={legend}>Zahlungsziel und Texte</legend>
          <TextField
            form={form}
            path="defaultPaymentDays"
            label="Standard-Zahlungsziel (Tage)"
            inputMode="numeric"
            autoComplete="off"
            className="max-w-xs"
            hint="Vorbelegung für neue Rechnungen. Leer = kein Fälligkeitsdatum."
          />
          <TextAreaField form={form} path="paymentNote" label="Zahlungstext mit Fälligkeitsdatum" />
          <TextAreaField form={form} path="paymentNoteWithoutDueDate" label="Zahlungstext ohne Fälligkeitsdatum" hint="Platzhalter: {Faellig} (Fälligkeitsdatum), {Betrag}, {Nr}, {Kunde}, {Datum}, {Leistungsdatum}" />
        </fieldset>

        <SaveBar form={form} />
      </form>
    </WithPreview>
  )
}
