'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { Field, RequiredNote } from '@/components/form/field'
import { useBlurValidation } from '@/components/form/use-blur-validation'
import { FormAlert } from '@/components/form-alert'
import { useTenant } from '@/features/tenants/tenant-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { COUNTRIES } from '@/lib/countries'
import { emptyFormState, type FormState } from '@/lib/form'
import { saveCustomer } from './actions'
import { CUSTOMER_FIELDS, type CustomerField, customerSchema } from './schema'

export function CustomerForm({ id, initial }: { id: string | null; initial: Partial<Record<CustomerField, string>> }) {
  const { tenant, path } = useTenant()
  const [state, action, pending] = useActionState<FormState<CustomerField>, FormData>(
    saveCustomer.bind(null, tenant.id, id),
    emptyFormState(initial),
  )
  const { errors, formRef, onBlur } = useBlurValidation(customerSchema, state, CUSTOMER_FIELDS)
  const v = state.values

  return (
    <form ref={formRef} action={action} onBlur={onBlur} noValidate className="mt-8 max-w-2xl space-y-8">
      {state.message && <FormAlert>{state.message}</FormAlert>}
      <RequiredNote />

      <fieldset className="space-y-5">
        <legend className="font-display text-xl font-semibold">Kunde</legend>
        <Field name="name" label="Name oder Firma" required error={errors.name}>
          {(p) => <Input {...p} defaultValue={v.name} autoComplete="organization" />}
        </Field>
        <Field name="contactPerson" label="Ansprechpartner" error={errors.contactPerson}>
          {(p) => <Input {...p} defaultValue={v.contactPerson} autoComplete="name" />}
        </Field>
        <Field name="email" label="E-Mail" error={errors.email}>
          {(p) => <Input {...p} type="email" inputMode="email" defaultValue={v.email} autoComplete="email" />}
        </Field>
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="font-display text-xl font-semibold">Adresse</legend>
        <Field name="street" label="Straße und Hausnummer" error={errors.street}>
          {(p) => <Input {...p} defaultValue={v.street} autoComplete="street-address" />}
        </Field>
        <div className="grid gap-5 sm:grid-cols-[10rem_1fr]">
          <Field name="postalCode" label="PLZ" error={errors.postalCode}>
            {(p) => <Input {...p} defaultValue={v.postalCode} autoComplete="postal-code" inputMode="numeric" />}
          </Field>
          <Field name="city" label="Ort" error={errors.city}>
            {(p) => <Input {...p} defaultValue={v.city} autoComplete="address-level2" />}
          </Field>
        </div>
        <Field name="countryCode" label="Land" required error={errors.countryCode}>
          {(p) => (
            <NativeSelect {...p} defaultValue={v.countryCode || 'DE'} autoComplete="country">
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="font-display text-xl font-semibold">Steuer und Notizen</legend>
        <Field name="vatId" label="USt-IdNr." hint="Nur bei Firmenkunden, z. B. DE123456789." error={errors.vatId}>
          {(p) => <Input {...p} defaultValue={v.vatId} autoCapitalize="characters" />}
        </Field>
        <Field name="notes" label="Notizen" hint="Nur intern, erscheint nicht auf Rechnungen." error={errors.notes}>
          {(p) => <Textarea {...p} defaultValue={v.notes} rows={3} />}
        </Field>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-6">
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {pending ? 'Speichern …' : id ? 'Änderungen speichern' : 'Kunde anlegen'}
        </Button>
        <Button asChild variant="ghost">
          <Link href={path('kunden')}>Abbrechen</Link>
        </Button>
      </div>
    </form>
  )
}
