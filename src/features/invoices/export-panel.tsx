'use client'

import { CircleCheck, Download, ExternalLink, FileText, Info } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useId, useRef, useState } from 'react'
import { FormAlert } from '@/components/form-alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { normalizeUserFilename } from '@/lib/domain/filename'
import { useEditorDirty } from './editor-context'

type ExportError = { kind: 'missing'; fields: string[] } | { kind: 'failed' } | { kind: 'expired' }
type Format = 'pdf' | 'docx'

// One dialog for both formats; only the PDF is archived (the archived PDF is the record of the invoice).
const COPY: Record<Format, { title: string; description: string; failed: string; done: (name: string) => string }> = {
  pdf: {
    title: 'PDF exportieren',
    description: 'Das PDF wird archiviert und anschließend heruntergeladen.',
    failed: 'Archivierung fehlgeschlagen, bitte erneut versuchen.',
    done: (name) => `${name} exportiert und archiviert.`,
  },
  docx: {
    title: 'Word-Datei exportieren',
    description: 'Die Word-Datei wird heruntergeladen. Sie wird nicht archiviert – maßgeblich bleibt das archivierte PDF.',
    failed: 'Word-Datei konnte nicht erstellt werden, bitte erneut versuchen.',
    done: (name) => `${name} exportiert.`,
  },
}

const withoutExtension = (filename: string) => filename.replace(/\.(pdf|docx)$/i, '')

/** File name from an RFC 5987 Content-Disposition header (falls back to the requested name). */
function filenameFrom(header: string | null, fallback: string): string {
  const match = header && /filename\*=UTF-8''([^;]+)/.exec(header)
  return match ? decodeURIComponent(match[1]) : fallback
}

/** "A, B, C." without doubling a final period (e.g. "USt-IdNr."). */
function fieldList(fields: string[]): string {
  const text = fields.join(', ')
  return text.endsWith('.') ? text : `${text}.`
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  // Give the browser a moment to start the download before releasing the blob.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Export of the saved invoice: PDF (archived first, then downloaded) or editable Word file (download only). */
export function ExportPanel({
  invoiceId,
  defaultFilenames,
  missing,
  leading,
}: {
  invoiceId: string
  defaultFilenames: Record<Format, string>
  missing: string[]
  /** Shown left of the PDF actions (the invoice number). */
  leading?: React.ReactNode
}) {
  const router = useRouter()
  const dirty = useEditorDirty()
  const [open, setOpen] = useState(false)
  const [format, setFormat] = useState<Format>('pdf')
  const [name, setName] = useState(withoutExtension(defaultFilenames.pdf))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<ExportError | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const alertRef = useRef<HTMLDivElement>(null)
  const inputId = useId()
  const hintId = useId()

  const blocked = missing.length > 0 || dirty
  const finalName = normalizeUserFilename(name, format)
  const copy = COPY[format]

  function openDialog(next: Format) {
    setFormat(next)
    setName(withoutExtension(defaultFilenames[next]))
    setError(null)
    setDone(null)
    setOpen(true)
  }

  async function runExport(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/${format}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: name }),
      })
      if (response.status === 401) return setError({ kind: 'expired' })
      if (response.status === 409) {
        const body = (await response.json().catch(() => ({}))) as { missing?: string[] }
        return setError({ kind: 'missing', fields: body.missing ?? missing })
      }
      if (!response.ok) throw new Error(`Export failed with ${response.status}`)
      const filename = filenameFrom(response.headers.get('Content-Disposition'), finalName)
      download(await response.blob(), filename)
      setDone(copy.done(filename))
      setOpen(false)
      // Reload server data so the archive list shows the new PDF (Word files are not archived).
      if (format === 'pdf') router.refresh()
    } catch (err) {
      console.error(err)
      setError({ kind: 'failed' })
    } finally {
      setPending(false)
      // Errors are announced via role="alert"; move focus there so keyboard users land on it.
      window.setTimeout(() => alertRef.current?.focus(), 0)
    }
  }

  return (
    <section aria-label="Export" className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {leading}
        {/* Mobile: equal full-width buttons stacked; from sm: side by side at natural width. */}
        <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap">
          {blocked ? (
            <Button type="button" variant="outline" className="gap-2" disabled aria-describedby="pdf-blocked">
              <ExternalLink aria-hidden className="size-4" />
              PDF ansehen
            </Button>
          ) : (
            <Button asChild variant="outline" className="gap-2">
              <a href={`/api/invoices/${invoiceId}/pdf`} target="_blank" rel="noopener">
                <ExternalLink aria-hidden className="size-4" />
                PDF ansehen
              </a>
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            disabled={blocked}
            aria-describedby={blocked ? 'pdf-blocked' : undefined}
            onClick={() => openDialog('docx')}
          >
            <FileText aria-hidden className="size-4" />
            Word-Datei exportieren
          </Button>
          {/* The archived PDF is the main action (one primary button per screen). */}
          <Button type="button" className="gap-2" disabled={blocked} aria-describedby={blocked ? 'pdf-blocked' : undefined} onClick={() => openDialog('pdf')}>
            <Download aria-hidden className="size-4" />
            PDF exportieren
          </Button>
        </div>
      </div>

      {blocked && (
        <p id="pdf-blocked" className="mt-3 flex items-start gap-2 text-sm text-muted-foreground sm:justify-end sm:text-right">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
          {missing.length > 0 ? (
            <span>
              Export gesperrt – Firmendaten unvollständig: {fieldList(missing)}{' '}
              <Link href="/einstellungen" className="font-medium text-foreground underline underline-offset-4">
                Firmendaten ergänzen
              </Link>
            </span>
          ) : (
            <span>Ungespeicherte Änderungen – bitte zuerst speichern. Exportiert wird die gespeicherte Fassung.</span>
          )}
        </p>
      )}
      {done && !blocked && (
        <p role="status" className="mt-3 flex items-start gap-2 text-sm sm:justify-end">
          <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
          {done}
        </p>
      )}

      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent showCloseButton={false} className="gap-5 p-5 sm:max-w-md">
          <div className="space-y-1.5">
            <DialogTitle className="font-display text-xl font-semibold">{copy.title}</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">{copy.description}</DialogDescription>
          </div>
          <form onSubmit={runExport} noValidate className="space-y-5">
            {error && (
              <FormAlert ref={alertRef}>
                {error.kind === 'missing' ? (
                  <>
                    Firmendaten unvollständig: {fieldList(error.fields)}{' '}
                    <Link href="/einstellungen" className="font-medium underline underline-offset-4">
                      Zu den Einstellungen
                    </Link>
                  </>
                ) : error.kind === 'expired' ? (
                  'Sitzung abgelaufen – bitte neu anmelden.'
                ) : (
                  copy.failed
                )}
              </FormAlert>
            )}
            <div className="space-y-1.5">
              <Label htmlFor={inputId}>Dateiname</Label>
              <Input id={inputId} value={name} onChange={(e) => setName(e.target.value)} aria-describedby={hintId} autoComplete="off" spellCheck={false} />
              <p id={hintId} className="text-sm break-all text-muted-foreground">
                Gespeichert als <span className="font-mono text-foreground">{finalName}</span>
              </p>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <DialogClose asChild>
                <Button type="button" variant="ghost" disabled={pending}>
                  Abbrechen
                </Button>
              </DialogClose>
              <Button type="submit" className="gap-2" disabled={pending} aria-busy={pending}>
                <Download aria-hidden className="size-4" />
                {pending ? 'Wird exportiert …' : 'Exportieren'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  )
}
