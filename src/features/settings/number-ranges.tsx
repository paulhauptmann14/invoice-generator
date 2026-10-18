'use client'

import { Plus } from 'lucide-react'
import { useActionState, useState } from 'react'
import { FormAlert } from '@/components/form-alert'
import { Button } from '@/components/ui/button'
import type { NumberRangeChoice } from '@/features/invoices/draft'
import { useTenant } from '@/features/tenants/tenant-context'
import { archiveNumberRange, makeDefaultNumberRange, saveNumberRange, type SettingsFormState } from './actions'
import { ErrorSummary, TextField } from './fields'
import { exampleNumber } from './number-range-rules'
import { numberRangeFormSchema } from './schemas'
import { useSettingsForm } from './use-settings-form'

const noMessage: SettingsFormState = { message: null, errors: {} }

/** Create (range = null) or edit a range: name + format with an example of the first number. */
function RangeEditor({ range, year, onCancel }: { range: NumberRangeChoice | null; year: number; onCancel: () => void }) {
  const { tenant } = useTenant()
  const form = useSettingsForm({
    initial: { name: range?.name ?? '', format: range?.format ?? '' },
    schema: numberRangeFormSchema,
    action: saveNumberRange.bind(null, tenant.id, range?.id ?? null),
    idPrefix: `range-${range?.id ?? 'neu'}`,
  })
  const example = exampleNumber(form.draft.format.trim(), year)
  return (
    <form action={form.formAction} noValidate className="space-y-4">
      <input type="hidden" name="payload" value={form.payload} />
      <ErrorSummary form={form} />
      <div className="grid gap-4 @lg:grid-cols-2">
        <TextField form={form} path="name" label="Name" required autoComplete="off" autoFocus hint="Z. B. „Rechnungen“ oder „Gutscheine“." />
        <TextField
          form={form}
          path="format"
          label="Format"
          required
          autoComplete="off"
          spellCheck={false}
          className="[&_input]:font-mono"
          hint={example ? `Erste Nummer ${year}: ${example}` : 'Platzhalter: {JJJJ} oder {JJ} für das Jahr, {N} oder {NNNN} für den Zähler.'}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={form.pending} aria-busy={form.pending}>
          {form.pending ? 'Wird gespeichert …' : range ? 'Speichern' : 'Nummernkreis anlegen'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={form.pending}>
          Abbrechen
        </Button>
      </div>
    </form>
  )
}

function RangeRow({ range, year }: { range: NumberRangeChoice; year: number }) {
  const { tenant } = useTenant()
  const [editing, setEditing] = useState(false)
  const [archiveState, archiveAction, archivePending] = useActionState(archiveNumberRange.bind(null, tenant.id, range.id, !range.archived), noMessage)
  const [defaultState, defaultAction, defaultPending] = useActionState(makeDefaultNumberRange.bind(null, tenant.id, range.id), noMessage)
  const message = archiveState.message ?? defaultState.message

  if (editing) {
    return (
      <li className="px-4 py-4 sm:px-5">
        <RangeEditor range={range} year={year} onCancel={() => setEditing(false)} />
      </li>
    )
  }
  return (
    <li className="space-y-3 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="font-medium">
            {range.name}
            {range.isDefault && <span className="ml-2 text-sm font-normal text-muted-foreground">Standard</span>}
          </p>
          <p className="text-sm text-muted-foreground">
            Format <span className="font-mono text-foreground">{range.format}</span>, erste Nummer {year}: <span className="font-mono text-foreground">{exampleNumber(range.format, year)}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {!range.archived && (
            <Button type="button" variant="ghost" onClick={() => setEditing(true)}>
              Bearbeiten
            </Button>
          )}
          {!range.archived && !range.isDefault && (
            <form action={defaultAction}>
              <Button type="submit" variant="ghost" disabled={defaultPending}>
                Als Standard festlegen
              </Button>
            </form>
          )}
          {!range.isDefault && (
            <form action={archiveAction}>
              <Button type="submit" variant="ghost" disabled={archivePending}>
                {range.archived ? 'Wiederherstellen' : 'Archivieren'}
              </Button>
            </form>
          )}
        </div>
      </div>
      {message && <FormAlert>{message}</FormAlert>}
    </li>
  )
}

export function NumberRanges({ ranges, year }: { ranges: NumberRangeChoice[]; year: number }) {
  const [adding, setAdding] = useState(false)
  const active = ranges.filter((r) => !r.archived)
  const archived = ranges.filter((r) => r.archived)
  return (
    <section aria-labelledby="ranges-heading" className="@container space-y-4">
      <div>
        <h2 id="ranges-heading" className="font-display text-xl font-semibold">
          Nummernkreise
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Der Standardkreis ist bei neuen Rechnungen vorausgewählt. Gibt es mehrere Kreise, wird der Kreis im Rechnungsformular gewählt.
        </p>
      </div>
      <ul className="divide-y divide-border rounded-md border border-border bg-card">
        {active.map((r) => (
          <RangeRow key={`${r.id}-${r.name}-${r.format}-${r.isDefault}`} range={r} year={year} />
        ))}
        {adding && (
          <li className="px-4 py-4 sm:px-5">
            <RangeEditor range={null} year={year} onCancel={() => setAdding(false)} />
          </li>
        )}
      </ul>
      {!adding && (
        <Button type="button" variant="outline" className="gap-2" onClick={() => setAdding(true)}>
          <Plus aria-hidden className="size-4" />
          Neuer Nummernkreis
        </Button>
      )}
      {archived.length > 0 && (
        <div className="space-y-2 pt-2">
          <h3 className="text-sm font-medium">Archiviert</h3>
          <ul className="divide-y divide-border rounded-md border border-border bg-card">
            {archived.map((r) => (
              <RangeRow key={`${r.id}-archived`} range={r} year={year} />
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
