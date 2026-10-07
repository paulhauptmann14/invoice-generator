import { FieldError } from '@/components/field-error'
import { Label } from '@/components/ui/label'

export type FieldControlProps = {
  id: string
  name: string
  'aria-invalid': boolean
  'aria-describedby'?: string
  'aria-required'?: boolean
}

/** Label + required marker + hint + inline error, with ARIA wiring passed to the control. */
export function Field({
  name,
  label,
  required,
  hint,
  error,
  className,
  children,
}: {
  name: string
  label: string
  required?: boolean
  hint?: string
  error?: string
  className?: string
  children: (control: FieldControlProps) => React.ReactNode
}) {
  const id = `field-${name}`
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined
  return (
    <div className={['space-y-1.5', className].filter(Boolean).join(' ')}>
      <Label htmlFor={id}>
        {label}
        {required && (
          <span aria-hidden className="text-stamp">
            {' '}*
          </span>
        )}
      </Label>
      {children({ id, name, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy, 'aria-required': required || undefined })}
      {hint && !error && (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {error && errorId && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  )
}

export function RequiredNote() {
  return (
    <p className="text-sm text-muted-foreground">
      <span className="text-stamp">*</span> Pflichtfeld
    </p>
  )
}
