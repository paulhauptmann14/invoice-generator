'use client'

import { Check, ChevronsUpDown } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export type ComboboxOption = { value: string; label: string; detail?: string }

/** Searchable single select (shadcn pattern: Popover + cmdk). Keyboard and screen-reader accessible. */
export function Combobox({
  id,
  options,
  value,
  onSelect,
  placeholder,
  searchPlaceholder,
  emptyText,
  trigger,
}: {
  id?: string
  options: ComboboxOption[]
  value: string | null
  onSelect: (value: string) => void
  placeholder: string
  searchPlaceholder: string
  emptyText: string
  trigger?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.value === value)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between bg-card font-normal">
          {trigger ?? <span className="truncate">{selected?.label ?? placeholder}</span>}
          <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
        {/* label names the search input for screen readers (cmdk renders it visually hidden). */}
        <Command label={searchPlaceholder}>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList label="Vorschläge">
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={`${o.label} ${o.detail ?? ''} ${o.value}`}
                  onSelect={() => {
                    onSelect(o.value)
                    setOpen(false)
                  }}
                  className="min-h-11 md:min-h-9"
                >
                  <Check aria-hidden className={o.value === value ? 'size-4 opacity-100' : 'size-4 opacity-0'} />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{o.label}</span>
                    {o.detail && <span className="truncate text-xs text-muted-foreground">{o.detail}</span>}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
