'use client'

import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { applySelection, isCustomUnit, OTHER_UNIT, selectValueFor, UNIT_MAX_LENGTH, UNITS } from '@/lib/domain/units'

/**
 * Unit dropdown: no unit, the shared list, or "Andere …" which reveals a text input for a custom unit.
 * Controlled (`value` + `onChange`) or uncontrolled (`defaultValue`). The control that currently carries the
 * value gets `name` (select, or the text input in custom mode), so FormData and blur validation see the unit string.
 */
export function UnitSelect({
  id,
  name,
  value,
  defaultValue = '',
  onChange,
  customLabel = 'Eigene Einheit',
  customLabelSuffix,
  customLabelClassName = 'text-sm font-medium',
  ...aria
}: {
  id: string
  name?: string
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  customLabel?: string
  /** Screen-reader-only addition to the custom label, e.g. the position number. */
  customLabelSuffix?: string
  customLabelClassName?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
  'aria-required'?: boolean
}) {
  const controlled = value !== undefined
  const [inner, setInner] = useState(defaultValue)
  const current = controlled ? value : inner
  const [customMode, setCustomMode] = useState(isCustomUnit(current))
  const [seen, setSeen] = useState(current)
  const focusCustom = useRef(false)
  const customRef = useRef<HTMLInputElement>(null)

  // A value changed from outside (e.g. an article copied into the item): re-derive custom mode (adjust state during render).
  if (seen !== current) {
    setSeen(current)
    setCustomMode(isCustomUnit(current))
  }

  useEffect(() => {
    if (customMode && focusCustom.current) customRef.current?.focus()
    focusCustom.current = false
  }, [customMode])

  function emit(next: string) {
    setSeen(next)
    if (!controlled) setInner(next)
    onChange?.(next)
  }

  const selected = selectValueFor(current, customMode)
  const showCustom = selected === OTHER_UNIT
  const customId = `${id}-custom`

  return (
    <div className="space-y-1">
      <NativeSelect
        id={id}
        name={showCustom ? undefined : name}
        value={selected}
        onChange={(e) => {
          const next = applySelection(e.target.value)
          focusCustom.current = next.customMode
          setCustomMode(next.customMode)
          emit(next.value)
        }}
        {...aria}
      >
        <option value="">Ohne Einheit</option>
        {UNITS.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
        <option value={OTHER_UNIT}>Andere …</option>
      </NativeSelect>
      {showCustom && (
        <div className="space-y-1">
          <label htmlFor={customId} className={customLabelClassName}>
            {customLabel}
            {customLabelSuffix && <span className="sr-only"> {customLabelSuffix}</span>}
          </label>
          <Input
            ref={customRef}
            id={customId}
            name={name}
            value={current}
            maxLength={UNIT_MAX_LENGTH}
            onChange={(e) => emit(e.target.value)}
            aria-invalid={aria['aria-invalid']}
            aria-describedby={aria['aria-describedby']}
            className="bg-card"
          />
        </div>
      )}
    </div>
  )
}
