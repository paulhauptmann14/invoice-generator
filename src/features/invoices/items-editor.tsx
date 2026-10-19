'use client'

import { ArrowDown, ArrowUp, Plus, Trash2, Undo2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Combobox } from '@/components/combobox'
import { FieldError } from '@/components/field-error'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { RequiredMark } from '@/components/form/required-mark'
import { VAT_RATES } from '@/lib/domain/input-schemas'
import { formatEuro, toCents } from '@/lib/domain/money'
import { DiscountControl } from './discount-control'
import type { DraftAction, DraftItem, PickerArticle } from './draft'
import { FormSection } from '@/components/form/form-section'

// Row layout needs ~830px: rows from @4xl (56rem) of the *form* width (container query), cards below.
const GRID = '@4xl:grid @4xl:grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_7.5rem_6rem_7rem_auto] @4xl:items-start @4xl:gap-3'

export function ItemsEditor({
  items,
  lineTotals,
  lineDiscounts,
  discountMessages,
  invalidKeys,
  articles,
  dispatch,
  errors,
}: {
  items: DraftItem[]
  lineTotals: Map<string, number>
  lineDiscounts: Map<string, number>
  /** Live message per item key for a discount the server would reject; a server error wins. */
  discountMessages: Map<string, string>
  invalidKeys: string[]
  articles: PickerArticle[]
  dispatch: React.Dispatch<DraftAction>
  errors: Record<string, string>
}) {
  const newKey = () => crypto.randomUUID()
  // Last removed position, kept for "Rückgängig" (forgiving instead of asking before every removal).
  const [removed, setRemoved] = useState<{ item: DraftItem; index: number } | null>(null)
  const undoRef = useRef<HTMLButtonElement>(null)
  // 'undo' or a control id; applied after the next render.
  const focusNext = useRef<string | null>(null)

  // The pressed button disappears with its row: keep keyboard focus on the next sensible control.
  useEffect(() => {
    const target = focusNext.current
    if (target === null) return
    focusNext.current = null
    if (target === 'undo') undoRef.current?.focus()
    else document.getElementById(target)?.focus()
  })

  function remove(item: DraftItem, index: number) {
    setRemoved({ item, index })
    dispatch({ type: 'removeItem', key: item.key })
    focusNext.current = 'undo'
  }

  function undo() {
    if (!removed) return
    dispatch({ type: 'restoreItem', item: removed.item, index: removed.index })
    focusNext.current = `inv-items.${Math.min(removed.index, items.length)}.description`
    setRemoved(null)
  }

  const removedLabel = removed?.item.description.split('\n')[0].trim()
  return (
    <FormSection title="Positionen">
      {errors.items && <FieldError id="inv-items-error">{errors.items}</FieldError>}

      <div aria-hidden className={`hidden border-b border-border pb-2 text-xs font-medium text-muted-foreground ${GRID}`}>
        <span>
          Beschreibung
          <RequiredMark />
        </span>
        <span className="text-right">
          Menge
          <RequiredMark />
        </span>
        <span>Einheit</span>
        <span className="text-right">
          Einzelpreis
          <RequiredMark />
        </span>
        <span>MwSt.</span>
        <span className="text-right">Gesamt</span>
        <span className="w-[7.5rem]" />
      </div>

      <ol className="space-y-4 @4xl:space-y-2">
        {items.map((item, index) => {
          const n = index + 1
          const err = (field: string) => errors[`items.${index}.${field}`]
          const field = (name: keyof DraftItem) => `inv-items.${index}.${name}`
          const update = (f: 'description' | 'quantity' | 'unit' | 'unitPriceGross' | 'vatRate', value: string) =>
            dispatch({ type: 'updateItem', key: item.key, field: f, value })
          const total = lineTotals.get(item.key)
          return (
            <li key={item.key} className={`rounded-lg border border-border p-4 @4xl:rounded-none @4xl:border-0 @4xl:p-0 ${GRID}`}>
              {/* Cards need the number to tell positions apart; the desktop rows read as a table, so there it only serves screen readers. */}
              <h2 className="mb-3 text-base font-semibold @4xl:sr-only">Position {n}</h2>
              <div className="space-y-1">
                <label htmlFor={field('description')} className="text-sm font-medium @4xl:sr-only">
                  Beschreibung<span className="sr-only"> Position {n}</span>
                  <RequiredMark />
                </label>
                <Textarea
                  id={field('description')}
                  aria-required
                  rows={1}
                  value={item.description}
                  onChange={(e) => update('description', e.target.value)}
                  aria-invalid={Boolean(err('description'))}
                  className="min-h-11 bg-card @4xl:min-h-10"
                />
                {err('description') && <FieldError id={`${field('description')}-error`}>{err('description')}</FieldError>}
                {item.articleId === null && item.description.trim() !== '' && (
                  <label className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground @4xl:min-h-8">
                    <input
                      type="checkbox"
                      checked={item.saveAsArticle}
                      onChange={(e) => dispatch({ type: 'setSaveAsArticle', key: item.key, value: e.target.checked })}
                      className="size-4 accent-[var(--color-tinte)]"
                    />
                    Als Artikel speichern
                  </label>
                )}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 @4xl:contents">
                <div className="space-y-1">
                  <label htmlFor={field('quantity')} className="text-sm font-medium @4xl:sr-only">
                    Menge<span className="sr-only"> Position {n}</span>
                    <RequiredMark />
                  </label>
                  <Input
                    id={field('quantity')}
                    aria-required
                    inputMode="decimal"
                    value={item.quantity}
                    onChange={(e) => update('quantity', e.target.value)}
                    aria-invalid={Boolean(err('quantity'))}
                    className="bg-card text-right tabular-nums"
                  />
                  {err('quantity') && <FieldError id={`${field('quantity')}-error`}>{err('quantity')}</FieldError>}
                </div>
                <div className="space-y-1">
                  <label htmlFor={field('unit')} className="text-sm font-medium @4xl:sr-only">
                    Einheit<span className="sr-only"> Position {n}</span>
                  </label>
                  <Input id={field('unit')} list="unit-suggestions" value={item.unit} onChange={(e) => update('unit', e.target.value)} className="bg-card" />
                </div>
                <div className="space-y-1">
                  <label htmlFor={field('unitPriceGross')} className="text-sm font-medium @4xl:sr-only">
                    Einzelpreis brutto<span className="sr-only"> Position {n}</span>
                    <RequiredMark />
                  </label>
                  <Input
                    id={field('unitPriceGross')}
                    aria-required
                    inputMode="decimal"
                    value={item.unitPriceGross}
                    onChange={(e) => update('unitPriceGross', e.target.value)}
                    aria-invalid={Boolean(err('unitPriceGross'))}
                    className="bg-card text-right tabular-nums"
                  />
                  {err('unitPriceGross') && <FieldError id={`${field('unitPriceGross')}-error`}>{err('unitPriceGross')}</FieldError>}
                </div>
                <div className="space-y-1">
                  <label htmlFor={field('vatRate')} className="text-sm font-medium @4xl:sr-only">
                    MwSt.-Satz<span className="sr-only"> Position {n}</span>
                  </label>
                  <NativeSelect id={field('vatRate')} value={item.vatRate} onChange={(e) => update('vatRate', e.target.value)}>
                    {VAT_RATES.map((rate) => (
                      <option key={rate} value={String(rate)}>
                        {rate} %
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </div>

              <p className="mt-3 flex items-baseline justify-between text-sm @4xl:mt-0 @4xl:block @4xl:pt-2.5 @4xl:text-right">
                <span className="text-muted-foreground @4xl:sr-only">Gesamt</span>
                <span className="tabular-nums" aria-live="polite">
                  {invalidKeys.includes(item.key) || total === undefined ? '–' : formatEuro(total)}
                </span>
              </p>

              <div className="mt-3 flex justify-end gap-1 @4xl:mt-0">
                <Button type="button" variant="ghost" size="icon" className="size-11 @4xl:size-8" aria-label={`Position ${n} nach oben`} disabled={index === 0} onClick={() => dispatch({ type: 'moveItem', key: item.key, direction: -1 })}>
                  <ArrowUp aria-hidden />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="size-11 @4xl:size-8" aria-label={`Position ${n} nach unten`} disabled={index === items.length - 1} onClick={() => dispatch({ type: 'moveItem', key: item.key, direction: 1 })}>
                  <ArrowDown aria-hidden />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="size-11 @4xl:size-8" aria-label={`Position ${n} entfernen`} onClick={() => remove(item, index)}>
                  <Trash2 aria-hidden />
                </Button>
              </div>

              {/* Full-width row under the item fields; starts at the description column in the desktop grid. */}
              <div role="group" aria-label={`Rabatt Position ${n}`} className="mt-3 @4xl:col-span-full @4xl:mt-0">
                <DiscountControl
                  idPrefix={`inv-items.${index}`}
                  label="Rabatt"
                  kind={item.discountKind}
                  value={item.discountValue}
                  deductionCents={lineDiscounts.get(item.key) ?? null}
                  error={err('discount') ?? discountMessages.get(item.key)}
                  onKindChange={(kind) => dispatch({ type: 'setItemDiscountKind', key: item.key, kind })}
                  onValueChange={(value) => dispatch({ type: 'setItemDiscountValue', key: item.key, value })}
                />
              </div>
            </li>
          )
        })}
      </ol>

      {/* Always rendered, so screen readers announce the removal when the text appears. */}
      <div role="status">
        {removed && (
          <p className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg bg-muted py-1 pr-1 pl-4 text-sm">
            <span className="min-w-0 truncate">
              {removedLabel ? `„${removedLabel}“ entfernt.` : `Position ${removed.index + 1} entfernt.`}
            </span>
            <Button ref={undoRef} type="button" variant="ghost" className="gap-2" onClick={undo}>
              <Undo2 aria-hidden className="size-4" />
              Rückgängig
            </Button>
          </p>
        )}
      </div>

      <datalist id="unit-suggestions">
        {['Stk.', 'kg', 'g', 'Pers.', 'Portion', 'Std.', 'Pauschale', 'l', 'Fl.'].map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>

      <div className="flex flex-col gap-2 @lg:flex-row">
        <div className="@lg:w-72">
          <Combobox
            options={articles.map((a) => ({ value: a.id, label: a.name, detail: `${formatEuro(toCents(a.unitPriceGross))} · ${a.unit}` }))}
            value={null}
            onSelect={(id) => {
              const article = articles.find((a) => a.id === id)
              if (article) dispatch({ type: 'addArticle', key: newKey(), article })
              setRemoved(null)
            }}
            placeholder="Artikel hinzufügen"
            searchPlaceholder="Artikel suchen"
            emptyText="Kein Artikel gefunden."
            trigger={
              <span className="flex items-center gap-2">
                <Plus aria-hidden className="size-4" />
                Artikel hinzufügen
              </span>
            }
          />
        </div>
        <Button type="button" variant="outline" className="gap-2" onClick={() => {
            dispatch({ type: 'addFreeItem', key: newKey() })
            setRemoved(null)
          }}>
          <Plus aria-hidden className="size-4" />
          Leere Position
        </Button>
      </div>
    </FormSection>
  )
}
