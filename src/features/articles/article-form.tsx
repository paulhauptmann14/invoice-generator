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
import { emptyFormState, type FormState } from '@/lib/form'
import { saveArticle } from './actions'
import { ARTICLE_FIELDS, type ArticleField, articleSchema, VAT_RATES } from './schema'

const UNIT_SUGGESTIONS = ['Stk.', 'kg', 'g', 'Pers.', 'Portion', 'Std.', 'Pauschale', 'l', 'Fl.']

export function ArticleForm({ id, initial }: { id: string | null; initial: Partial<Record<ArticleField, string>> }) {
  const { tenant, path } = useTenant()
  const [state, action, pending] = useActionState<FormState<ArticleField>, FormData>(
    saveArticle.bind(null, tenant.id, id),
    emptyFormState(initial),
  )
  const { errors, formRef, onBlur } = useBlurValidation(articleSchema, state, ARTICLE_FIELDS)
  const v = state.values

  return (
    <form ref={formRef} action={action} onBlur={onBlur} noValidate className="mt-8 max-w-2xl space-y-8">
      {state.message && <FormAlert>{state.message}</FormAlert>}
      <RequiredNote />

      <fieldset className="space-y-5">
        <legend className="font-display text-xl font-semibold">Artikel</legend>
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
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="font-display text-xl font-semibold">Preis</legend>
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
          <Field name="unit" label="Einheit" hint="z. B. kg, Stk., Pers." error={errors.unit}>
            {(p) => <Input {...p} list="unit-suggestions" defaultValue={v.unit} />}
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
        <datalist id="unit-suggestions">
          {UNIT_SUGGESTIONS.map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-6">
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {pending ? 'Speichern …' : id ? 'Änderungen speichern' : 'Artikel anlegen'}
        </Button>
        <Button asChild variant="ghost">
          <Link href={path('artikel')}>Abbrechen</Link>
        </Button>
      </div>
    </form>
  )
}
