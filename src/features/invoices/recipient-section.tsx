'use client'

import { Combobox } from '@/components/combobox'
import { FieldError } from '@/components/field-error'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { COUNTRIES } from '@/lib/countries'
import type { DraftAction, DraftRecipient, InvoiceDraft, PickerCustomer } from './draft'

const FIELDS: { field: keyof DraftRecipient; label: string; autoComplete?: string; span?: string }[] = [
  { field: 'name', label: 'Name oder Firma', autoComplete: 'organization' },
  { field: 'contactPerson', label: 'Ansprechpartner', autoComplete: 'name' },
  { field: 'street', label: 'Straße und Hausnummer', autoComplete: 'street-address' },
]

export function RecipientSection({
  draft,
  dispatch,
  customers,
  errors,
}: {
  draft: InvoiceDraft
  dispatch: React.Dispatch<DraftAction>
  customers: PickerCustomer[]
  errors: Record<string, string>
}) {
  const r = draft.recipient
  const input = (field: keyof DraftRecipient, props: React.ComponentProps<typeof Input> = {}) => {
    const path = `recipient.${field}`
    const error = errors[path]
    return (
      <>
        <Input
          id={`inv-${path}`}
          value={r[field]}
          onChange={(e) => dispatch({ type: 'setRecipient', field, value: e.target.value })}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `inv-${path}-error` : undefined}
          {...props}
        />
        {error && <FieldError id={`inv-${path}-error`}>{error}</FieldError>}
      </>
    )
  }

  return (
    <fieldset className="space-y-5">
      <legend className="font-display text-xl font-semibold">Empfänger</legend>

      <div className="space-y-1.5">
        <Label htmlFor="inv-customer">Kunde aus dem Kundenstamm</Label>
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <Combobox
              id="inv-customer"
              options={customers.map((c) => ({ value: c.id, label: c.name, detail: [c.postalCode, c.city].filter(Boolean).join(' ') }))}
              value={draft.customerId}
              onSelect={(id) => {
                const customer = customers.find((c) => c.id === id)
                if (customer) dispatch({ type: 'selectCustomer', customer })
              }}
              placeholder="Kunden auswählen"
              searchPlaceholder="Name oder Ort eingeben"
              emptyText="Kein Kunde gefunden."
            />
          </div>
          {draft.customerId && (
            <button
              type="button"
              onClick={() => dispatch({ type: 'clearCustomer' })}
              className="min-h-11 shrink-0 px-2 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground md:min-h-10"
            >
              Leeren
            </button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">Oder die Anschrift direkt unten eingeben.</p>
      </div>

      {FIELDS.map(({ field, label, autoComplete }) => (
        <div key={field} className="space-y-1.5">
          <Label htmlFor={`inv-recipient.${field}`}>
            {label}
            {field === 'name' && (
              <span aria-hidden className="text-stamp">
                {' '}*
              </span>
            )}
          </Label>
          {input(field, { autoComplete, 'aria-required': field === 'name' || undefined })}
        </div>
      ))}

      <div className="grid gap-5 sm:grid-cols-[10rem_1fr]">
        <div className="space-y-1.5">
          <Label htmlFor="inv-recipient.postalCode">PLZ</Label>
          {input('postalCode', { inputMode: 'numeric', autoComplete: 'postal-code' })}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="inv-recipient.city">Ort</Label>
          {input('city', { autoComplete: 'address-level2' })}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="inv-recipient.countryCode">Land</Label>
          <NativeSelect
            id="inv-recipient.countryCode"
            value={r.countryCode}
            onChange={(e) => dispatch({ type: 'setRecipient', field: 'countryCode', value: e.target.value })}
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="inv-recipient.vatId">USt-IdNr. des Empfängers</Label>
          {input('vatId', { autoCapitalize: 'characters' })}
        </div>
      </div>

      {!draft.customerId && r.name.trim() !== '' && (
        <label className="flex min-h-11 items-center gap-3 text-sm md:min-h-9">
          <input
            type="checkbox"
            checked={draft.saveAsCustomer}
            onChange={(e) => dispatch({ type: 'setSaveAsCustomer', value: e.target.checked })}
            className="size-4 accent-[var(--color-tinte)]"
          />
          Als neuen Kunden speichern
        </label>
      )}
    </fieldset>
  )
}
