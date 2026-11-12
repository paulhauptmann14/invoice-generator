'use client'

import { useActionState } from 'react'
import { Field, RequiredNote } from '@/components/form/field'
import { useBlurValidation } from '@/components/form/use-blur-validation'
import { useFormDirty } from '@/components/form/use-form-dirty'
import { FormAlert } from '@/components/form-alert'
import { GuardedLink } from '@/components/unsaved-changes'
import { useTenant } from '@/features/tenants/tenant-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { emptyFormState, type FormState } from '@/lib/form'
import { saveArticle } from './actions'
import { ARTICLE_FIELDS, type ArticleField, articleSchema, VAT_RATES } from './schema'
import { FormSection } from '@/components/form/form-section'
import { UnitSelect } from '@/components/form/unit-select'

export function ArticleForm({ id, initial }: { id: string | null; initial: Partial<Record<ArticleField, string>> }) {
  const { tenant, path } = useTenant()
  const [state, action, pending] = useActionState<FormState<ArticleField>, FormData>(
    saveArticle.bind(null, tenant.id, id),
    emptyFormState(initial),
  )
  const { errors, formRef, onBlur } = useBlurValidation(articleSchema, state, ARTICLE_FIELDS)
  const v = state.values
  const checkDirty = useFormDirty(formRef)

  return (
    <form ref={formRef} action={action} onBlur={onBlur} onInput={checkDirty} onChange={checkDirty} noValidate className="mt-8 max-w-2xl space-y-8">
      {state.message && <FormAlert>{state.message}</FormAlert>}
      <RequiredNote />

      <FormSection title="Artikel">
        <Field name="name" label="Bezeichnung" required error={errors.name}>
          {(p) => <Input {...p} defaultValue={v.name} />}
        </Field>
        <Field
          name="description"
          label="Beschreibung"
          hint="Erscheint als zweite Zeile auf der Rechnung."
          error={errors.description}
        >
          {(p) => <Textarea {...p} defaultValue={v.description} rows={2} />}
        </Field>
      </FormSection>

      <FormSection title="Preis">
        <div className="grid gap-5 sm:grid-cols-3">
          <Field
            name="unitPriceGross"
            label="Einzelpreis brutto (€)"
            required
            hint="Inkl. MwSt., z. B. 24,90"
            error={errors.unitPriceGross}
          >
            {(p) => <Input {...p} inputMode="decimal" defaultValue={v.unitPriceGross} className="text-right tabular-nums" />}
          </Field>
          <Field name="unit" label="Einheit" error={errors.unit}>
            {(p) => <UnitSelect {...p} defaultValue={v.unit} />}
          </Field>
          <Field name="vatRate" label="MwSt.-Satz" required error={errors.vatRate}>
            {(p) => (
              <NativeSelect {...p} defaultValue={v.vatRate || '7'}>
                {VAT_RATES.map((rate) => (
                  <option key={rate} value={String(rate)}>
                    {rate} %
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
        </div>
        <div className="space-y-1">
          {/* The whole row is the click target (44px on mobile). */}
          <label className="flex min-h-11 items-center gap-3 text-sm md:min-h-9">
            <input
              type="checkbox"
              name="withoutQuantity"
              defaultChecked={v.withoutQuantity === 'on'}
              aria-describedby="withoutQuantity-hint"
              className="size-4 accent-[var(--color-tinte)]"
            />
            Ohne Menge in die Rechnung übernehmen
          </label>
          <p id="withoutQuantity-hint" className="pl-7 text-sm text-muted-foreground">
            Für Beträge wie „lt. Tagesabrechnung“: Die Rechnung zeigt dann nur Text und Betrag.
          </p>
        </div>
      </FormSection>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-6">
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {pending ? 'Speichern …' : id ? 'Änderungen speichern' : 'Artikel anlegen'}
        </Button>
        <Button asChild variant="ghost">
          <GuardedLink href={path('artikel')}>Abbrechen</GuardedLink>
        </Button>
      </div>
    </form>
  )
}
