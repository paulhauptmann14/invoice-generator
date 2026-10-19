'use client'

import { useTenant } from '@/features/tenants/tenant-context'
import { buildFilename } from '@/lib/domain/filename'
import { saveFilenameSettings } from './actions'
import { ErrorSummary, SaveBar, TextField } from './fields'
import { filenameFormSchema } from './schemas'
import { useSettingsForm } from './use-settings-form'

/** File name pattern for exports, with a live example based on a sample invoice. */
export function FilenameForm({ initial, example }: { initial: string; example: { number: string; issueDate: string } }) {
  const { tenant } = useTenant()
  const form = useSettingsForm({ initial: { filenameTemplate: initial }, schema: filenameFormSchema, action: saveFilenameSettings.bind(null, tenant.id) })
  const preview = buildFilename(form.draft.filenameTemplate, { customer: 'Musterkunde GmbH', ...example }, 'pdf')
  return (
    <form action={form.formAction} noValidate className="@container space-y-5">
      <input type="hidden" name="payload" value={form.payload} />
      <div className="px-1">
        <h2 className="type-title">Dateinamen</h2>
        <p className="mt-1 text-sm text-muted-foreground">Vorschlag beim Export, im Export-Dialog weiterhin änderbar.</p>
      </div>
      <ErrorSummary form={form} />
      <div className="surface p-4 sm:p-6">
      <TextField
        form={form}
        path="filenameTemplate"
        label="Muster"
        required
        autoComplete="off"
        spellCheck={false}
        className="max-w-xl [&_input]:font-mono"
        hint={
          <>
            Platzhalter: {'{Kunde}'}, {'{Nr}'}, {'{Datum}'}, {'{JJJJ}'}. Beispiel: <span className="font-mono break-all text-foreground">{preview}</span>
          </>
        }
      />
      </div>
      <SaveBar form={form} />
    </form>
  )
}
