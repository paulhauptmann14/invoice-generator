'use client'

import { CircleCheck, Download, ExternalLink, FileText, Info, Printer } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useRef, useState } from 'react'
import { FormAlert } from '@/components/form-alert'
import { GuardedLink } from '@/components/unsaved-changes'
import { useTenant } from '@/features/tenants/tenant-context'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { normalizeUserFilename } from '@/lib/domain/filename'
import { useStoredFlag } from '@/lib/use-stored-flag'
import { useEditorDirty } from './editor-context'
import { recipientAddressMessage } from './recipient-address-message'
import { canPrintDirectly, printPdf } from './print-pdf'
import { chooseLocation, savePicker, writeFile } from './save-file'

type ExportError =
  | { kind: 'missing'; fields: string[]; recipient: string[]; eInvoice: string[] }
  | { kind: 'failed' }
  | { kind: 'expired' }
  | { kind: 'write' }
type Format = 'pdf' | 'docx'
type Action = Format | 'print'

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

// Printing renders the invoice without archiving it (like "PDF ansehen"); `direct`: this browser opens the print dialog itself.
const PRINT_COPY = {
  title: 'Drucken',
  description: (direct: boolean) =>
    direct
      ? 'Der Druckdialog öffnet sich gleich. Es wird nichts archiviert.'
      : 'Die Rechnung öffnet sich in einem neuen Tab, dort mit ⌘P bzw. Strg+P drucken. Es wird nichts archiviert.',
  failed: 'Die Druckfassung konnte nicht erstellt werden, bitte erneut versuchen.',
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
  recipientMissing = [],
  leading,
}: {
  invoiceId: string
  defaultFilenames: Record<Format, string>
  missing: string[]
  /** Empty address fields of the recipient on an invoice above 250 EUR (§ 14 UStG); export is blocked while any are missing. */
  recipientMissing?: string[]
  /** Shown left of the PDF actions (the invoice number). */
  leading?: React.ReactNode
}) {
  const router = useRouter()
  const { path, api } = useTenant()
  const dirty = useEditorDirty()
  const [open, setOpen] = useState(false)
  const [action, setAction] = useState<Action>('pdf')
  const [name, setName] = useState(withoutExtension(defaultFilenames.pdf))
  // Letterhead paper already carries the logo and the business address: leave both out.
  const [letterhead, setLetterhead] = useState(false)
  // E-invoice (ZUGFeRD): remembered per browser, since a business mostly invoices either companies or consumers.
  const [zugferd, setZugferd] = useStoredFlag('export-zugferd', false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<ExportError | null>(null)
  const [done, setDone] = useState<string | null>(null)
  // Whether this browser can ask for the location; read when the dialog opens (never during server render).
  const [picks, setPicks] = useState(false)
  const [direct, setDirect] = useState(false)
  const alertRef = useRef<HTMLDivElement>(null)
  // The dialog has no DialogTrigger, so focus goes back to the opening button by hand.
  const pdfButtonRef = useRef<HTMLButtonElement>(null)
  const docxButtonRef = useRef<HTMLButtonElement>(null)
  const printButtonRef = useRef<HTMLButtonElement>(null)
  const openerRefs = { pdf: pdfButtonRef, docx: docxButtonRef, print: printButtonRef }
  // The hidden frame of the last print; removed with the next print or when the page goes away.
  const printFrame = useRef<(() => void) | null>(null)
  useEffect(() => () => printFrame.current?.(), [])
  const inputId = useId()
  const hintId = useId()
  const zugferdHintId = useId()

  const blocked = missing.length > 0 || recipientMissing.length > 0 || dirty
  const format: Format = action === 'docx' ? 'docx' : 'pdf'
  const finalName = normalizeUserFilename(name, format)
  const copy = COPY[format]

  function openDialog(next: Action) {
    setAction(next)
    if (next !== 'print') setName(withoutExtension(defaultFilenames[next]))
    setLetterhead(false)
    setError(null)
    setDone(null)
    setPicks(savePicker() !== null)
    setDirect(canPrintDirectly())
    setOpen(true)
  }

  async function runPrint() {
    const url = api(`invoices/${invoiceId}/pdf${letterhead ? '?letterhead=1' : ''}`)
    if (!direct) {
      // Opened right away, while the click still counts as user activation (no pop-up blocker); the browser's PDF viewer prints.
      window.open(url, '_blank', 'noopener')
      setOpen(false)
      return
    }
    setPending(true)
    try {
      const response = await fetch(url)
      if (response.status === 401) return setError({ kind: 'expired' })
      if (response.status === 409) {
        const body = (await response.json().catch(() => ({}))) as { recipientMissing?: string[] }
        return setError({ kind: 'missing', fields: [], recipient: body.recipientMissing ?? recipientMissing, eInvoice: [] })
      }
      if (!response.ok) throw new Error(`Print version failed with ${response.status}`)
      printFrame.current?.()
      printFrame.current = printPdf(await response.blob())
      setOpen(false)
    } catch (err) {
      console.error(err)
      setError({ kind: 'failed' })
    } finally {
      setPending(false)
      window.setTimeout(() => alertRef.current?.focus(), 0)
    }
  }

  async function runExport(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (action === 'print') return runPrint()
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
        body: JSON.stringify({ filename: name, letterhead, ...(format === 'pdf' && { zugferd }) }),
      })
      if (response.status === 401) return setError({ kind: 'expired' })
      if (response.status === 409) {
        const body = (await response.json().catch(() => ({}))) as { missing?: string[]; recipientMissing?: string[]; eInvoiceMissing?: string[] }
        return setError({
          kind: 'missing',
          fields: body.missing ?? missing,
          recipient: body.recipientMissing ?? recipientMissing,
          eInvoice: body.eInvoiceMissing ?? [],
        })
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
            ref={printButtonRef}
            type="button"
            variant="outline"
            className="gap-2"
            disabled={blocked}
            aria-describedby={blocked ? 'pdf-blocked' : undefined}
            onClick={() => openDialog('print')}
          >
            <Printer aria-hidden className="size-4" />
            Drucken
          </Button>
          <Button
            ref={docxButtonRef}
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
          <Button ref={pdfButtonRef} type="button" className="gap-2" disabled={blocked} aria-describedby={blocked ? 'pdf-blocked' : undefined} onClick={() => openDialog('pdf')}>
            <Download aria-hidden className="size-4" />
            PDF exportieren
          </Button>
        </div>
      </div>

      {blocked && (
        <div id="pdf-blocked" className="mt-3 space-y-1.5 text-sm text-muted-foreground">
          {missing.length > 0 && (
            <p className="flex items-start gap-2 sm:justify-end sm:text-right">
              <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>
                Export gesperrt – Firmendaten unvollständig: {fieldList(missing)}{' '}
                <GuardedLink href={path('einstellungen/firma')} className="font-medium text-foreground underline underline-offset-4">
                  Firmendaten ergänzen
                </GuardedLink>
              </span>
            </p>
          )}
          {recipientMissing.length > 0 && (
            <p className="flex items-start gap-2 sm:justify-end sm:text-right">
              <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>Export gesperrt – {recipientAddressMessage(recipientMissing)} Bitte unten im Formular ergänzen und speichern.</span>
            </p>
          )}
          {dirty && (
            <p className="flex items-start gap-2 sm:justify-end sm:text-right">
              <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>Ungespeicherte Änderungen – bitte zuerst speichern. Exportiert wird die gespeicherte Fassung.</span>
            </p>
          )}
        </div>
      )}
      {done && !blocked && (
        <p role="status" className="mt-3 flex items-start gap-2 text-sm sm:justify-end">
          <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
          {done}
        </p>
      )}

      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent
          showCloseButton={false}
          className="gap-5 p-5 sm:max-w-md"
          onCloseAutoFocus={(event) => {
            // Escape, Abbrechen and a finished export all end up here: back to the button that opened the dialog.
            event.preventDefault()
            openerRefs[action].current?.focus()
          }}
        >
          <div className="space-y-1.5">
            <DialogTitle className="type-title">{action === 'print' ? PRINT_COPY.title : copy.title}</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {action === 'print' ? PRINT_COPY.description(direct) : copy.description(picks)}
            </DialogDescription>
          </div>
          <form onSubmit={runExport} noValidate className="space-y-5">
            {error && (
              <FormAlert ref={alertRef}>
                {error.kind === 'missing' ? (
                  <>
                    {error.fields.length > 0 && (
                      <>
                        Firmendaten unvollständig: {fieldList(error.fields)}{' '}
                        <GuardedLink href={path('einstellungen/firma')} className="font-medium underline underline-offset-4">
                          Zu den Einstellungen
                        </GuardedLink>
                      </>
                    )}
                    {error.fields.length > 0 && error.recipient.length > 0 && ' '}
                    {error.recipient.length > 0 && recipientAddressMessage(error.recipient)}
                    {error.eInvoice.length > 0 && <>Für die E-Rechnung fehlt: {fieldList(error.eInvoice)}</>}
                  </>
                ) : error.kind === 'expired' ? (
                  'Sitzung abgelaufen – bitte neu anmelden.'
                ) : error.kind === 'write' ? (
                  copy.writeFailed
                ) : action === 'print' ? (
                  PRINT_COPY.failed
                ) : (
                  copy.failed
                )}
              </FormAlert>
            )}
            {action !== 'print' && (
              <div className="space-y-1.5">
                <Label htmlFor={inputId}>Dateiname</Label>
                <Input id={inputId} value={name} onChange={(e) => setName(e.target.value)} aria-describedby={hintId} autoComplete="off" spellCheck={false} />
                <p id={hintId} className="text-sm break-all text-muted-foreground">
                  {picks ? 'Vorschlag im Speichern-Dialog:' : 'Gespeichert als'} <span className="font-mono text-foreground">{finalName}</span>
                </p>
              </div>
            )}
            {/* The whole row is the click target (44px on mobile). */}
            <label className="flex min-h-11 items-center gap-3 text-sm md:min-h-9">
              <input type="checkbox" checked={letterhead} onChange={(e) => setLetterhead(e.target.checked)} className="size-4 accent-[var(--color-tinte)]" />
              Für Briefpapier (ohne Logo und Absenderzeile)
            </label>
            {action === 'pdf' && (
              <div>
                <label className="flex min-h-11 items-center gap-3 text-sm md:min-h-9">
                  <input
                    type="checkbox"
                    checked={zugferd}
                    onChange={(e) => setZugferd(e.target.checked)}
                    aria-describedby={zugferdHintId}
                    className="size-4 accent-[var(--color-tinte)]"
                  />
                  Als E-Rechnung (ZUGFeRD)
                </label>
                <p id={zugferdHintId} className="pl-7 text-sm text-muted-foreground">
                  Das PDF enthält die Rechnungsdaten zusätzlich maschinenlesbar (EN 16931), für Rechnungen an Unternehmen.
                </p>
              </div>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <DialogClose asChild>
                <Button type="button" variant="ghost" disabled={pending}>
                  Abbrechen
                </Button>
              </DialogClose>
              {action === 'print' ? (
                <Button type="submit" className="gap-2" disabled={pending} aria-busy={pending}>
                  <Printer aria-hidden className="size-4" />
                  {pending ? 'Wird vorbereitet …' : direct ? 'Drucken' : 'Zum Drucken öffnen'}
                </Button>
              ) : (
                <Button type="submit" className="gap-2" disabled={pending} aria-busy={pending}>
                  <Download aria-hidden className="size-4" />
                  {pending ? 'Wird exportiert …' : picks ? 'Speichern unter …' : 'Exportieren'}
                </Button>
              )}
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  )
}
