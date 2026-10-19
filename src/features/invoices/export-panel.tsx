'use client'

import { CircleCheck, Download, ExternalLink, FileText, Info } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useId, useRef, useState } from 'react'
import { FormAlert } from '@/components/form-alert'
import { useTenant } from '@/features/tenants/tenant-context'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { normalizeUserFilename } from '@/lib/domain/filename'
import { useEditorDirty } from './editor-context'
import { chooseLocation, savePicker, writeFile } from './save-file'

type ExportError = { kind: 'missing'; fields: string[] } | { kind: 'failed' } | { kind: 'expired' } | { kind: 'write' }
type Format = 'pdf' | 'docx'

// One dialog for both formats; only the PDF is archived (the archived PDF is the record of the invoice).
// `picks`: the browser asks where to save (Chrome, Edge); otherwise the file goes to the downloads folder.
const COPY: Record<Format, { title: string; description: (picks: boolean) => string; failed: string; writeFailed: string; done: (name: string) => string }> = {
  pdf: {
    title: 'PDF exportieren',
    description: (picks) => `Das PDF wird archiviert und anschließend ${picks ? 'am gewählten Ort gespeichert' : 'heruntergeladen'}.`,
    failed: 'Archivierung fehlgeschlagen, bitte erneut versuchen.',
    writeFailed: 'Das PDF ist archiviert, konnte aber nicht gespeichert werden. Es lässt sich unter „Archivierte PDFs“ erneut herunterladen.',
    done: (name) => `${name} exportiert und archiviert.`,
  },
  docx: {
    title: 'Word-Datei exportieren',
    description: (picks) =>
      `Die Word-Datei wird ${picks ? 'am gewählten Ort gespeichert' : 'heruntergeladen'}. Sie wird nicht archiviert – maßgeblich bleibt das archivierte PDF.`,
    failed: 'Word-Datei konnte nicht erstellt werden, bitte erneut versuchen.',
    writeFailed: 'Die Word-Datei konnte nicht gespeichert werden, bitte erneut versuchen.',
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
  hasLogo = false,
  leading,
}: {
  invoiceId: string
  defaultFilenames: Record<Format, string>
  missing: string[]
  /** Offers "Ohne Logo (für Briefpapier)" when a logo is configured. */
  hasLogo?: boolean
  /** Shown left of the PDF actions (the invoice number). */
  leading?: React.ReactNode
}) {
  const router = useRouter()
  const { path, api } = useTenant()
  const dirty = useEditorDirty()
  const [open, setOpen] = useState(false)
  const [format, setFormat] = useState<Format>('pdf')
  const [name, setName] = useState(withoutExtension(defaultFilenames.pdf))
  const [withoutLogo, setWithoutLogo] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<ExportError | null>(null)
  const [done, setDone] = useState<string | null>(null)
  // Whether this browser can ask for the location; read when the dialog opens (never during server render).
  const [picks, setPicks] = useState(false)
  const alertRef = useRef<HTMLDivElement>(null)
  const inputId = useId()
  const hintId = useId()

  const blocked = missing.length > 0 || dirty
  const finalName = normalizeUserFilename(name, format)
  const copy = COPY[format]

  function openDialog(next: Format) {
    setFormat(next)
    setName(withoutExtension(defaultFilenames[next]))
    setWithoutLogo(false)
    setError(null)
    setDone(null)
    setPicks(savePicker() !== null)
    setOpen(true)
  }

  async function runExport(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    // The save dialog has to come first, while the click still counts as user activation. Cancelling it
    // exports nothing (and archives nothing); where it is unavailable, the file is downloaded as before.
    const picker = savePicker()
    const choice = picker ? await chooseLocation(picker, finalName, format) : ({ kind: 'unavailable' } as const)
    if (choice.kind === 'cancelled') return
    setPending(true)
    try {
      const response = await fetch(api(`invoices/${invoiceId}/${format}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: name, withoutLogo }),
      })
      if (response.status === 401) return setError({ kind: 'expired' })
      if (response.status === 409) {
        const body = (await response.json().catch(() => ({}))) as { missing?: string[] }
        return setError({ kind: 'missing', fields: body.missing ?? missing })
      }
      if (!response.ok) throw new Error(`Export failed with ${response.status}`)
      const filename = filenameFrom(response.headers.get('Content-Disposition'), finalName)
      const blob = await response.blob()
      let written = true
      if (choice.kind === 'chosen') {
        written = await writeFile(choice.handle, blob).then(
          () => true,
          (err: unknown) => {
            console.error(err)
            return false
          },
        )
      } else {
        download(blob, filename)
      }
      if (written) {
        setDone(copy.done(choice.kind === 'chosen' ? choice.handle.name : filename))
        setOpen(false)
      } else {
        setError({ kind: 'write' })
      }
      // Reload server data so the archive list shows the new PDF (archived even if writing the file failed).
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
              <a href={api(`invoices/${invoiceId}/pdf`)} target="_blank" rel="noopener">
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
              <Link href={path('einstellungen/firma')} className="font-medium text-foreground underline underline-offset-4">
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
            <DialogTitle className="type-title">{copy.title}</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">{copy.description(picks)}</DialogDescription>
          </div>
          <form onSubmit={runExport} noValidate className="space-y-5">
            {error && (
              <FormAlert ref={alertRef}>
                {error.kind === 'missing' ? (
                  <>
                    Firmendaten unvollständig: {fieldList(error.fields)}{' '}
                    <Link href={path('einstellungen/firma')} className="font-medium underline underline-offset-4">
                      Zu den Einstellungen
                    </Link>
                  </>
                ) : error.kind === 'expired' ? (
                  'Sitzung abgelaufen – bitte neu anmelden.'
                ) : error.kind === 'write' ? (
                  copy.writeFailed
                ) : (
                  copy.failed
                )}
              </FormAlert>
            )}
            <div className="space-y-1.5">
              <Label htmlFor={inputId}>Dateiname</Label>
              <Input id={inputId} value={name} onChange={(e) => setName(e.target.value)} aria-describedby={hintId} autoComplete="off" spellCheck={false} />
              <p id={hintId} className="text-sm break-all text-muted-foreground">
                {picks ? 'Vorschlag im Speichern-Dialog:' : 'Gespeichert als'} <span className="font-mono text-foreground">{finalName}</span>
              </p>
            </div>
            {hasLogo && (
              // The whole row is the click target (44px on mobile).
              <label className="flex min-h-11 items-center gap-3 text-sm md:min-h-9">
                <input type="checkbox" checked={withoutLogo} onChange={(e) => setWithoutLogo(e.target.checked)} className="size-4 accent-[var(--color-tinte)]" />
                Ohne Logo (für Briefpapier)
              </label>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <DialogClose asChild>
                <Button type="button" variant="ghost" disabled={pending}>
                  Abbrechen
                </Button>
              </DialogClose>
              <Button type="submit" className="gap-2" disabled={pending} aria-busy={pending}>
                <Download aria-hidden className="size-4" />
                {pending ? 'Wird exportiert …' : picks ? 'Speichern unter …' : 'Exportieren'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  )
}
