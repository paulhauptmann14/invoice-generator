'use client'

import { Plus } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { FieldError } from '@/components/field-error'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatEuro } from '@/lib/domain/money'
import type { DiscountKind } from '@/lib/domain/totals'

const MINUS = '−'

const KINDS: { kind: DiscountKind; symbol: string; name: string }[] = [
  { kind: 'percent', symbol: '%', name: ' Prozent' },
  { kind: 'amount', symbol: '€', name: ' Euro' },
]

/**
 * Optional discount of one item or of the whole invoice. Closed it is a single ghost button; open it
 * shows the value input, a % / € toggle, the live deduction and a remove button. The amounts come
 * from the caller (draftTotals); this component only formats them.
 */
export function DiscountControl({
  idPrefix,
  inputId: inputIdProp,
  label,
  kind,
  value,
  deductionCents,
  error,
  onKindChange,
  onValueChange,
}: {
  /** The input id is `${idPrefix}.discount`. */
  idPrefix: string
  /** Overrides the input id, so it can match the form's `inv-<errorKey>` focus lookup. */
  inputId?: string
  label: string
  kind: DiscountKind | null
  value: string
  /** Shown live as "−49,80 €"; null when not computable. */
  deductionCents: number | null
  error?: string
  onKindChange: (kind: DiscountKind | null) => void
  onValueChange: (value: string) => void
}) {
  const inputId = inputIdProp ?? `${idPrefix}.discount`
  const errorId = `${inputId}-error`
  const inputRef = useRef<HTMLInputElement>(null)
  const openRef = useRef<HTMLButtonElement>(null)
  // Set by the click that swaps open and closed; applied once the other state is rendered.
  const focusNext = useRef<'input' | 'open' | null>(null)

  useEffect(() => {
    const target = focusNext.current
    if (target === null) return
    focusNext.current = null
    if (target === 'input') inputRef.current?.focus()
    else openRef.current?.focus()
  })

  if (kind === null) {
    return (
      <Button
        ref={openRef}
        type="button"
        variant="ghost"
        className="gap-2 text-muted-foreground"
        onClick={() => {
          focusNext.current = 'input'
          onKindChange('percent')
        }}
      >
        <Plus aria-hidden className="size-4" />
        {label}
      </Button>
    )
  }

  return (
    <div className="space-y-1">
      <Label htmlFor={inputId}>{label}</Label>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Input
          ref={inputRef}
          id={inputId}
          inputMode="decimal"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className="w-28 text-right tabular-nums"
        />
        <div role="group" aria-label="Rabattart" className="inline-flex gap-0.5 rounded-lg bg-(--segment-track) p-0.5">
          {KINDS.map(({ kind: option, symbol, name }) => (
            <button
              key={option}
              type="button"
              aria-pressed={kind === option}
              onClick={() => onKindChange(option)}
              className={[
                'flex min-h-11 min-w-11 items-center justify-center rounded-md px-3 text-sm transition-colors duration-(--duration-fast) md:min-h-9 md:min-w-9',
                kind === option
                  ? 'bg-card font-semibold text-foreground shadow-(--elev-raised)'
                  : 'text-muted-foreground hover:text-foreground active:bg-pressed/60 active:duration-0',
              ].join(' ')}
            >
              {symbol}
              <span className="sr-only">{name}</span>
            </button>
          ))}
        </div>
        {deductionCents !== null && deductionCents > 0 && (
          <span className="text-sm tabular-nums">
            {MINUS}
            {formatEuro(deductionCents)}
          </span>
        )}
        <Button
          type="button"
          variant="ghost"
          className="text-muted-foreground"
          onClick={() => {
            focusNext.current = 'open'
            onKindChange(null)
          }}
        >
          Rabatt entfernen
        </Button>
      </div>
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  )
}
