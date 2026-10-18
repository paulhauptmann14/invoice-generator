'use client'

import { ImageUp, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useId, useRef, useState } from 'react'
import { FieldError } from '@/components/field-error'
import { Button } from '@/components/ui/button'
import { useTenant } from '@/features/tenants/tenant-context'

/**
 * Logo upload (PNG/JPEG, ≤ 2 MB). Saved immediately through the logo route, independent of the
 * appearance form, so unsaved changes there are kept.
 */
export function LogoField({ hasLogo, version }: { hasLogo: boolean; version: string }) {
  const { api } = useTenant()
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<'upload' | 'remove' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const errorId = useId()
  const statusId = useId()

  async function send(request: Promise<Response>, kind: 'upload' | 'remove') {
    setPending(kind)
    setError(null)
    try {
      const response = await request
      if (response.status === 401) return setError('Sitzung abgelaufen – bitte neu anmelden.')
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string }
        return setError(body.error ?? 'Das Logo konnte nicht gespeichert werden. Bitte erneut versuchen.')
      }
      router.refresh()
    } catch {
      setError('Das Logo konnte nicht gespeichert werden. Bitte erneut versuchen.')
    } finally {
      setPending(null)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function upload(file: File | undefined) {
    if (!file) return
    const body = new FormData()
    body.append('file', file)
    void send(fetch(api('settings/logo'), { method: 'POST', body }), 'upload')
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">Logo</p>
      {hasLogo ? (
        <div className="flex min-h-24 items-center justify-center rounded-md border border-border bg-card p-4">
          {/* Private image from this origin (no-store); next/image would add nothing here. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${api('settings/logo')}?v=${encodeURIComponent(version)}`} alt="Aktuelles Logo" className="max-h-20 max-w-full object-contain" />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Noch kein Logo. Im Layout „Briefpapier“ bleibt der Kopf dann frei.</p>
      )}
      <input
        ref={inputRef}
        id="logo-file"
        type="file"
        accept="image/png,image/jpeg"
        className="sr-only"
        onChange={(e) => upload(e.target.files?.[0])}
        aria-describedby={[statusId, error ? errorId : null].filter(Boolean).join(' ')}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="gap-2" disabled={pending !== null} onClick={() => inputRef.current?.click()}>
          <ImageUp aria-hidden className="size-4" />
          {pending === 'upload' ? 'Wird hochgeladen …' : hasLogo ? 'Logo ersetzen' : 'Logo hochladen'}
        </Button>
        {hasLogo && (
          <Button
            type="button"
            variant="ghost"
            className="gap-2 text-muted-foreground"
            disabled={pending !== null}
            onClick={() => void send(fetch(api('settings/logo'), { method: 'DELETE' }), 'remove')}
          >
            <Trash2 aria-hidden className="size-4" />
            {pending === 'remove' ? 'Wird entfernt …' : 'Logo entfernen'}
          </Button>
        )}
      </div>
      <p id={statusId} className="text-sm text-muted-foreground">
        PNG oder JPEG, höchstens 2 MB. Wird sofort gespeichert.
      </p>
      {/* Errors arrive asynchronously, so they are announced. */}
      <div role="alert">{error && <FieldError id={errorId}>{error}</FieldError>}</div>
    </div>
  )
}
