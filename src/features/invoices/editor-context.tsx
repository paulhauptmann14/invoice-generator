'use client'

import { createContext, useContext, useEffect, useState } from 'react'

type EditorState = { dirty: boolean; setDirty: (dirty: boolean) => void }

const EditorContext = createContext<EditorState | null>(null)

/** Shares "the form has unsaved changes" between the invoice form and the export panel. */
export function InvoiceEditorProvider({ children }: { children: React.ReactNode }) {
  const [dirty, setDirty] = useState(false)
  return <EditorContext value={{ dirty, setDirty }}>{children}</EditorContext>
}

/** Read by the export panel. Without a provider (new invoice) nothing is dirty. */
export function useEditorDirty(): boolean {
  return useContext(EditorContext)?.dirty ?? false
}

/** Called by the form; a no-op outside a provider. */
export function useReportDirty(dirty: boolean) {
  const setDirty = useContext(EditorContext)?.setDirty
  useEffect(() => {
    setDirty?.(dirty)
  }, [dirty, setDirty])
}
