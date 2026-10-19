'use client'

import { Eye, EyeOff, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useMediaQuery } from '@/lib/use-media-query'
import { useStoredFlag } from '@/lib/use-stored-flag'
import { LivePreview } from './live-preview'

export type PreviewMode = { wide: boolean; on: boolean; setOn: (on: boolean) => void; side: boolean }

/** Side-by-side preview from 80rem (Tailwind xl, 1280px), switchable and remembered per form type. */
export function usePreviewMode(storageKey: string): PreviewMode {
  const wide = useMediaQuery('(min-width: 80rem)')
  const [on, setOn] = useStoredFlag(storageKey, true)
  return { wide, on, setOn, side: wide && on }
}

/** Wide screens: show/hide the side preview. Narrow screens: open the preview in a full-screen dialog. */
export function PreviewToggle({ mode, url, payload }: { mode: PreviewMode; url: string; payload: string }) {
  if (mode.wide) {
    return (
      <Button type="button" variant="outline" className="gap-2" onClick={() => mode.setOn(!mode.on)}>
        {mode.on ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
        {mode.on ? 'Vorschau ausblenden' : 'Vorschau einblenden'}
      </Button>
    )
  }
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="gap-2">
          <Eye aria-hidden className="size-4" />
          Vorschau
        </Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        // Full-screen sheet: rises from the bottom edge and leaves the same way (no zoom).
        className="inset-0 top-0 left-0 flex h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-3 overflow-y-auto rounded-none border-0 bg-background p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] data-open:zoom-in-100! data-open:slide-in-from-bottom-8 data-closed:zoom-out-100! data-closed:slide-out-to-bottom-8 sm:max-w-none sm:p-6"
      >
        <div className="flex items-center justify-between gap-3">
          <DialogTitle className="type-title">Vorschau</DialogTitle>
          <DialogClose asChild>
            <Button type="button" variant="outline" className="min-h-11 gap-2 md:min-h-9">
              <X aria-hidden className="size-4" />
              Schließen
            </Button>
          </DialogClose>
        </div>
        <LivePreview url={url} payload={payload} showLabel={false} className="mx-auto w-full max-w-2xl" />
      </DialogContent>
    </Dialog>
  )
}

/** Form next to its live PDF preview. data-wide lets the app shell widen the content area. */
export function WithPreview({ mode, url, payload, children }: { mode: PreviewMode; url: string; payload: string; children: React.ReactNode }) {
  return (
    <div data-wide className={mode.side ? 'mt-8 grid grid-cols-[minmax(0,1fr)_minmax(22rem,40%)] items-start gap-10' : 'mt-8'}>
      {/* Container queries: the form adapts to its own width, which shrinks next to the preview. */}
      <div className="@container min-w-0">{children}</div>
      {mode.side && <LivePreview url={url} payload={payload} className="sticky top-6" frameClassName="aspect-[210/297] max-h-[calc(100dvh-6rem)]" />}
    </div>
  )
}
