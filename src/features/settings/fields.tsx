'use client'

import { FieldError } from '@/components/field-error'
import { FormAlert } from '@/components/form-alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { fieldId, getIn } from './form-state'
import type { SettingsFormApi } from './use-settings-form'

// Field building blocks bound to a settings form by path (label, hint, inline error, ARIA wiring).

// The draft type does not matter to a field: it only reads and writes by path.
type AnyForm = Pick<SettingsFormApi<unknown>, 'idPrefix' | 'draft' | 'errors' | 'set' | 'validate' | 'state' | 'alertRef' | 'pending' | 'dirty'>

type FieldProps = {
  form: AnyForm
  path: string
  label: string
  required?: boolean
  hint?: React.ReactNode
  className?: string
}

function useField({ form, path, hint }: Pick<FieldProps, 'form' | 'path' | 'hint'>) {
  const id = fieldId(path, form.idPrefix)
  const error = form.errors[path]
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  return {
    id,
    error,
    hintId,
    errorId,
    describedBy: [hintId, errorId].filter(Boolean).join(' ') || undefined,
    value: getIn(form.draft, path),
  }
}

function FieldLabel({ htmlFor, label, required }: { htmlFor: string; label: string; required?: boolean }) {
  return (
    <Label htmlFor={htmlFor}>
      {label}
      {required && (
        <span aria-hidden className="text-stamp">
          {' '}*
        </span>
      )}
    </Label>
  )
}

function FieldFoot({ hint, hintId, error, errorId }: { hint?: React.ReactNode; hintId?: string; error?: string; errorId?: string }) {
  return (
    <>
      {hint && (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {error && errorId && <FieldError id={errorId}>{error}</FieldError>}
    </>
  )
}

export function TextField({
  form,
  path,
  label,
  required,
  hint,
  className,
  ...inputProps
}: FieldProps & Omit<React.ComponentProps<'input'>, 'form' | 'value' | 'onChange' | 'onBlur' | 'id'>) {
  const f = useField({ form, path, hint })
  return (
    <div className={['space-y-1.5', className].filter(Boolean).join(' ')}>
      <FieldLabel htmlFor={f.id} label={label} required={required} />
      <Input
        id={f.id}
        value={String(f.value ?? '')}
        onChange={(e) => form.set(path, e.target.value)}
        onBlur={() => form.validate(path)}
        aria-invalid={Boolean(f.error)}
        aria-describedby={f.describedBy}
        aria-required={required || undefined}
        {...inputProps}
      />
      <FieldFoot hint={hint} hintId={f.hintId} error={f.error} errorId={f.errorId} />
    </div>
  )
}

export function TextAreaField({ form, path, label, required, hint, className, rows = 3 }: FieldProps & { rows?: number }) {
  const f = useField({ form, path, hint })
  return (
    <div className={['space-y-1.5', className].filter(Boolean).join(' ')}>
      <FieldLabel htmlFor={f.id} label={label} required={required} />
      <Textarea
        id={f.id}
        rows={rows}
        value={String(f.value ?? '')}
        onChange={(e) => form.set(path, e.target.value)}
        onBlur={() => form.validate(path)}
        aria-invalid={Boolean(f.error)}
        aria-describedby={f.describedBy}
      />
      <FieldFoot hint={hint} hintId={f.hintId} error={f.error} errorId={f.errorId} />
    </div>
  )
}

export function SelectField({ form, path, label, hint, className, options }: FieldProps & { options: readonly { value: string; label: string }[] }) {
  const f = useField({ form, path, hint })
  return (
    <div className={['space-y-1.5', className].filter(Boolean).join(' ')}>
      <FieldLabel htmlFor={f.id} label={label} />
      <NativeSelect id={f.id} value={String(f.value ?? '')} onChange={(e) => form.set(path, e.target.value)} aria-invalid={Boolean(f.error)} aria-describedby={f.describedBy}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </NativeSelect>
      <FieldFoot hint={hint} hintId={f.hintId} error={f.error} errorId={f.errorId} />
    </div>
  )
}

/** Whole row is the click target (44px on mobile). */
export function CheckboxField({ form, path, label, hint }: Omit<FieldProps, 'required' | 'className'>) {
  const f = useField({ form, path, hint })
  return (
    <div>
      <label className="flex min-h-11 items-center gap-3 text-sm md:min-h-9">
        <input
          id={f.id}
          type="checkbox"
          checked={Boolean(f.value)}
          onChange={(e) => form.set(path, e.target.checked)}
          aria-describedby={f.hintId}
          className="size-4 accent-[var(--color-tinte)]"
        />
        {label}
      </label>
      {hint && (
        <p id={f.hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  )
}

/** Radio group as fieldset; each option row is the click target. */
export function RadioField({
  form,
  path,
  label,
  options,
}: Omit<FieldProps, 'required' | 'hint' | 'className'> & { options: readonly { value: string; label: string; description?: string }[] }) {
  const f = useField({ form, path })
  return (
    <fieldset className="space-y-1" aria-describedby={f.errorId}>
      <legend className="mb-1.5 text-sm font-medium">{label}</legend>
      {options.map((o) => (
        <label key={o.value} className="flex min-h-11 items-start gap-3 py-1.5 text-sm md:min-h-9">
          <input
            type="radio"
            name={f.id}
            value={o.value}
            checked={f.value === o.value}
            onChange={() => form.set(path, o.value)}
            className="mt-0.5 size-4 accent-[var(--color-tinte)]"
          />
          <span>
            <span className="block">{o.label}</span>
            {o.description && <span className="block text-muted-foreground">{o.description}</span>}
          </span>
        </label>
      ))}
      {f.error && f.errorId && <FieldError id={f.errorId}>{f.error}</FieldError>}
    </fieldset>
  )
}

/** Form-level message after a failed save, with links to every invalid field (receives focus). */
export function ErrorSummary({ form }: { form: AnyForm }) {
  const { state, alertRef, idPrefix } = form
  if (!state.message) return null
  const paths = Object.keys(state.errors)
  return (
    <FormAlert ref={alertRef}>
      {state.message}
      {paths.length > 1 && (
        <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
          {paths.map((path) => (
            <li key={path}>
              <a href={`#${fieldId(path, idPrefix)}`} className="underline underline-offset-4">
                {state.errors[path]}
              </a>
            </li>
          ))}
        </ul>
      )}
    </FormAlert>
  )
}

/** Save button plus a note while there are unsaved changes. */
export function SaveBar({ form }: { form: AnyForm }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-border pt-6">
      <Button type="submit" disabled={form.pending} aria-busy={form.pending}>
        {form.pending ? 'Wird gespeichert …' : 'Speichern'}
      </Button>
      {form.dirty && !form.pending && <p className="text-sm text-muted-foreground">Ungespeicherte Änderungen</p>}
    </div>
  )
}

/** Hex input (#RRGGBB) with a native color picker next to it. */
export function ColorField({ form, path, label }: Omit<FieldProps, 'required' | 'hint' | 'className'>) {
  const f = useField({ form, path })
  const hex = String(f.value ?? '')
  return (
    <div className="space-y-1.5">
      <FieldLabel htmlFor={f.id} label={label} />
      <div className="flex gap-2">
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#000000'}
          onChange={(e) => form.set(path, e.target.value.toUpperCase())}
          aria-label={`${label} auswählen`}
          className="h-11 w-14 shrink-0 cursor-pointer rounded-md border border-input bg-card p-1 md:h-10"
        />
        <Input
          id={f.id}
          value={hex}
          onChange={(e) => form.set(path, e.target.value)}
          onBlur={() => form.validate(path)}
          aria-invalid={Boolean(f.error)}
          aria-describedby={f.describedBy}
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
        />
      </div>
      <FieldFoot error={f.error} errorId={f.errorId} />
    </div>
  )
}
