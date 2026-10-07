'use client'

import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Combobox } from '@/components/combobox'
import { FieldError } from '@/components/field-error'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { VAT_RATES } from '@/lib/domain/input-schemas'
import { formatEuro, toCents } from '@/lib/domain/money'
import type { DraftAction, DraftItem, PickerArticle } from './draft'

// Row layout needs ~830px of content width; below xl each item is a stacked card.
const GRID = 'xl:grid xl:grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_7.5rem_6rem_7rem_auto] xl:items-start xl:gap-3'

export function ItemsEditor({
  items,
  lineTotals,
  invalidKeys,
  articles,
  dispatch,
  errors,
}: {
  items: DraftItem[]
  lineTotals: Map<string, number>
  invalidKeys: string[]
  articles: PickerArticle[]
  dispatch: React.Dispatch<DraftAction>
  errors: Record<string, string>
}) {
  const newKey = () => crypto.randomUUID()
  return (
    <fieldset className="space-y-4">
      <legend className="font-display text-xl font-semibold">Positionen</legend>
      {errors.items && <FieldError id="inv-items-error">{errors.items}</FieldError>}

      <div aria-hidden className={`hidden border-b border-border pb-2 text-sm font-medium text-muted-foreground ${GRID}`}>
        <span>Beschreibung</span>
        <span className="text-right">Menge</span>
        <span>Einheit</span>
        <span className="text-right">Einzelpreis</span>
        <span>MwSt.</span>
        <span className="text-right">Gesamt</span>
        <span className="w-[7.5rem]" />
      </div>

      <ol className="space-y-4 xl:space-y-2">
        {items.map((item, index) => {
          const n = index + 1
          const err = (field: string) => errors[`items.${index}.${field}`]
          const field = (name: keyof DraftItem) => `inv-items.${index}.${name}`
          const update = (f: 'description' | 'quantity' | 'unit' | 'unitPriceGross' | 'vatRate', value: string) =>
            dispatch({ type: 'updateItem', key: item.key, field: f, value })
          const total = lineTotals.get(item.key)
          return (
            <li key={item.key} className={`rounded-md border border-border bg-card p-4 xl:border-0 xl:bg-transparent xl:p-0 ${GRID}`}>
              <div className="space-y-1">
                <label htmlFor={field('description')} className="text-sm font-medium xl:sr-only">
                  Beschreibung<span className="sr-only"> Position {n}</span>
                </label>
                <Textarea
                  id={field('description')}
                  rows={1}
                  value={item.description}
                  onChange={(e) => update('description', e.target.value)}
                  aria-invalid={Boolean(err('description'))}
                  className="min-h-11 bg-card xl:min-h-10"
                />
                {err('description') && <FieldError id={`${field('description')}-error`}>{err('description')}</FieldError>}
                {item.articleId === null && item.description.trim() !== '' && (
                  <label className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground xl:min-h-8">
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

              <div className="mt-3 grid grid-cols-2 gap-3 xl:contents">
                <div className="space-y-1">
                  <label htmlFor={field('quantity')} className="text-sm font-medium xl:sr-only">
                    Menge<span className="sr-only"> Position {n}</span>
                  </label>
                  <Input
                    id={field('quantity')}
                    inputMode="decimal"
                    value={item.quantity}
                    onChange={(e) => update('quantity', e.target.value)}
                    aria-invalid={Boolean(err('quantity'))}
                    className="bg-card text-right tabular-nums"
                  />
                  {err('quantity') && <FieldError id={`${field('quantity')}-error`}>{err('quantity')}</FieldError>}
                </div>
                <div className="space-y-1">
                  <label htmlFor={field('unit')} className="text-sm font-medium xl:sr-only">
                    Einheit<span className="sr-only"> Position {n}</span>
                  </label>
                  <Input id={field('unit')} list="unit-suggestions" value={item.unit} onChange={(e) => update('unit', e.target.value)} className="bg-card" />
                </div>
                <div className="space-y-1">
                  <label htmlFor={field('unitPriceGross')} className="text-sm font-medium xl:sr-only">
                    Einzelpreis brutto<span className="sr-only"> Position {n}</span>
                  </label>
                  <Input
                    id={field('unitPriceGross')}
                    inputMode="decimal"
                    value={item.unitPriceGross}
                    onChange={(e) => update('unitPriceGross', e.target.value)}
                    aria-invalid={Boolean(err('unitPriceGross'))}
                    className="bg-card text-right tabular-nums"
                  />
                  {err('unitPriceGross') && <FieldError id={`${field('unitPriceGross')}-error`}>{err('unitPriceGross')}</FieldError>}
                </div>
                <div className="space-y-1">
                  <label htmlFor={field('vatRate')} className="text-sm font-medium xl:sr-only">
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

              <p className="mt-3 flex items-baseline justify-between text-sm xl:mt-0 xl:block xl:pt-2.5 xl:text-right">
                <span className="text-muted-foreground xl:sr-only">Gesamt</span>
                <span className="tabular-nums" aria-live="polite">
                  {invalidKeys.includes(item.key) || total === undefined ? '–' : formatEuro(total)}
                </span>
              </p>

              <div className="mt-3 flex justify-end gap-1 xl:mt-0">
                <Button type="button" variant="ghost" size="icon" className="size-11 xl:size-8" aria-label={`Position ${n} nach oben`} disabled={index === 0} onClick={() => dispatch({ type: 'moveItem', key: item.key, direction: -1 })}>
                  <ArrowUp aria-hidden />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="size-11 xl:size-8" aria-label={`Position ${n} nach unten`} disabled={index === items.length - 1} onClick={() => dispatch({ type: 'moveItem', key: item.key, direction: 1 })}>
                  <ArrowDown aria-hidden />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="size-11 xl:size-8" aria-label={`Position ${n} entfernen`} onClick={() => dispatch({ type: 'removeItem', key: item.key })}>
                  <Trash2 aria-hidden />
                </Button>
              </div>
            </li>
          )
        })}
      </ol>

      <datalist id="unit-suggestions">
        {['Stk.', 'kg', 'g', 'Pers.', 'Portion', 'Std.', 'Pauschale', 'l', 'Fl.'].map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="sm:w-72">
          <Combobox
            options={articles.map((a) => ({ value: a.id, label: a.name, detail: `${formatEuro(toCents(a.unitPriceGross))} · ${a.unit}` }))}
            value={null}
            onSelect={(id) => {
              const article = articles.find((a) => a.id === id)
              if (article) dispatch({ type: 'addArticle', key: newKey(), article })
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
        <Button type="button" variant="outline" className="gap-2" onClick={() => dispatch({ type: 'addFreeItem', key: newKey() })}>
          <Plus aria-hidden className="size-4" />
          Freie Position
        </Button>
      </div>
    </fieldset>
  )
}
