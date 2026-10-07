'use client'

import { CircleAlert, ExternalLink, RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

type Status = 'loading' | 'ready' | 'error' | 'expired'
const DEBOUNCE_MS = 700

const STATUS_TEXT: Record<Status, string> = {
  loading: 'Wird aktualisiert …',
  ready: 'Aktuell',
  error: 'Vorschau konnte nicht erstellt werden.',
  expired: 'Sitzung abgelaufen – bitte neu anmelden.',
}

/**
 * Shows the draft as the real PDF (same renderer as the export). Requests are debounced,
 * superseded requests are aborted, and the previous PDF stays visible while the next one renders.
 */
export function LivePreview({
  payload,
  className,
  frameClassName,
  showLabel = true,
}: {
  payload: string
  className?: string
  frameClassName?: string
  /** Off inside the preview dialog, whose title already says "Vorschau". */
  showLabel?: boolean
}) {
  const [status, setStatus] = useState<Status>('loading')
  const [url, setUrl] = useState<string | null>(null)
  // The draft the visible PDF was rendered from; differs from `payload` while an update is pending.
  const [renderedPayload, setRenderedPayload] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const urlRef = useRef<string | null>(null)
  const firstRequest = useRef(true)

  useEffect(() => {
    const controller = new AbortController()
    // The first PDF is requested right away; later edits wait for a typing pause.
    const delay = firstRequest.current ? 0 : DEBOUNCE_MS
    firstRequest.current = false
    const timer = window.setTimeout(async () => {
      setStatus('loading')
      try {
        const response = await fetch('/api/invoices/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          signal: controller.signal,
        })
        if (response.status === 401) return setStatus('expired')
        if (!response.ok) throw new Error(`Preview request failed with ${response.status}`)
        const next = URL.createObjectURL(await response.blob())
        if (urlRef.current) URL.revokeObjectURL(urlRef.current)
        urlRef.current = next
        setUrl(next)
        setRenderedPayload(payload)
        setStatus('ready')
      } catch (error) {
        if (controller.signal.aborted) return
        console.error(error)
        setStatus('error')
      }
    }, delay)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [payload, attempt])

  // Release the last PDF when the preview goes away.
  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    },
    [],
  )

  const failed = status === 'error' || status === 'expired'
  // Edits waiting for the debounce already count as "updating", so a stale PDF is never labelled current.
  const shown: Status = status === 'ready' && renderedPayload !== payload ? 'loading' : status
  return (
    <section aria-label="Vorschau der Rechnung" className={['flex min-w-0 flex-col gap-2', className].filter(Boolean).join(' ')}>
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 md:min-h-9">
        <p className="flex items-baseline gap-2 text-sm">
          {showLabel && <span className="font-medium">PDF-Vorschau</span>}
          <span role="status" aria-atomic="true" className={failed ? 'text-stamp' : 'text-muted-foreground'}>
            {failed && <CircleAlert aria-hidden className="mr-1 inline size-4 align-[-0.15em]" />}
            {STATUS_TEXT[shown]}
          </span>
        </p>
        <span className="flex gap-1">
          {status === 'error' && (
            <Button type="button" variant="ghost" size="sm" className="min-h-11 gap-1.5 md:min-h-8" onClick={() => setAttempt((a) => a + 1)}>
              <RefreshCw aria-hidden className="size-4" />
              Erneut versuchen
            </Button>
          )}
          {url && (
            <Button asChild variant="ghost" size="sm" className="min-h-11 gap-1.5 md:min-h-8">
              <a href={url} target="_blank" rel="noopener">
                <ExternalLink aria-hidden className="size-4" />
                Im neuen Tab
              </a>
            </Button>
          )}
        </span>
      </div>
      <div
        aria-busy={shown === 'loading'}
        className={['relative w-full overflow-hidden rounded-md border border-border bg-card', frameClassName ?? 'aspect-[210/297]'].join(' ')}
      >
        {url ? (
          <iframe title="PDF-Vorschau der Rechnung" src={`${url}#toolbar=0&navpanes=0&view=FitH`} className="size-full" />
        ) : (
          <p className="p-6 text-sm text-muted-foreground">{failed ? 'Noch keine Vorschau vorhanden.' : 'Die Vorschau wird erstellt …'}</p>
        )}
        {/* Keep the last PDF visible while the next one renders; just dim it slightly. */}
        {shown === 'loading' && url && <div aria-hidden className="pointer-events-none absolute inset-0 bg-card/35 transition-opacity duration-150" />}
      </div>
    </section>
  )
}
