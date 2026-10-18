'use client'

import { RequiredNote } from '@/components/form/field'
import { PreviewToggle, usePreviewMode, WithPreview } from '@/features/invoices/with-preview'
import { useTenant } from '@/features/tenants/tenant-context'
import { saveCompanySettings } from './actions'
import { ErrorSummary, SaveBar, TextField } from './fields'
import { type CompanyFormInput, companyFormSchema } from './schemas'
import { useSettingsForm } from './use-settings-form'

const legend = 'font-display text-xl font-semibold'

export function CompanyForm({ initial }: { initial: CompanyFormInput }) {
  const { tenant, api } = useTenant()
  const form = useSettingsForm({ initial, schema: companyFormSchema, action: saveCompanySettings.bind(null, tenant.id) })
  const preview = usePreviewMode('einstellungen-vorschau')
  const previewUrl = api('settings/preview')
  const previewPayload = JSON.stringify({ tab: 'firma', form: form.draft })

  return (
    <WithPreview mode={preview} url={previewUrl} payload={previewPayload}>
      <form action={form.formAction} noValidate className="space-y-10">
        <input type="hidden" name="payload" value={form.payload} />
        <ErrorSummary form={form} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <RequiredNote />
          <PreviewToggle mode={preview} url={previewUrl} payload={previewPayload} />
        </div>

        <fieldset className="space-y-5">
          <legend className={legend}>Betrieb</legend>
          <TextField form={form} path="tenantName" label="Name des Betriebs" required autoComplete="off" hint="Erscheint im Betriebs-Umschalter, nicht auf der Rechnung." />
        </fieldset>

        <fieldset className="space-y-5">
          <legend className={legend}>Firma auf der Rechnung</legend>
          <TextField form={form} path="name" label="Firmenname" required autoComplete="organization" />
          <TextField form={form} path="owner" label="Inhaber" autoComplete="name" />
          <TextField form={form} path="street" label="Straße und Hausnummer" required autoComplete="street-address" />
          <div className="grid gap-5 @lg:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
            <TextField form={form} path="postalCode" label="PLZ" required autoComplete="postal-code" inputMode="numeric" />
            <TextField form={form} path="city" label="Ort" required autoComplete="address-level2" />
          </div>
          <TextField form={form} path="country" label="Land" autoComplete="country-name" />
        </fieldset>

        <fieldset className="space-y-5">
          <legend className={legend}>Steuer</legend>
          <p className="text-sm text-muted-foreground">
            <span aria-hidden className="text-stamp">
              *
            </span>{' '}
            Pflicht ist eines von beiden: Steuernummer oder USt-IdNr. Es steht auf jeder Rechnung.
          </p>
          <div className="grid gap-5 @lg:grid-cols-2">
            <TextField form={form} path="taxNumber" label="Steuernummer" autoComplete="off" />
            <TextField form={form} path="vatId" label="USt-IdNr." autoComplete="off" spellCheck={false} />
          </div>
          <TextField form={form} path="commercialRegister" label="Handelsregister" autoComplete="off" hint="Optional, z. B. „Amtsgericht Musterstadt HRB 1234“." />
        </fieldset>

        <fieldset className="space-y-5">
          <legend className={legend}>Kontakt</legend>
          <div className="grid gap-5 @lg:grid-cols-2">
            <TextField form={form} path="phone" label="Telefon" type="tel" autoComplete="tel" />
            <TextField form={form} path="email" label="E-Mail" type="email" autoComplete="email" spellCheck={false} />
          </div>
          <TextField form={form} path="web" label="Website" autoComplete="url" spellCheck={false} />
        </fieldset>

        <SaveBar form={form} />
      </form>
    </WithPreview>
  )
}
