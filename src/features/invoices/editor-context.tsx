'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { useReportUnsaved } from '@/components/unsaved-changes'

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

/** Called by the form: shares the state with the export panel and the in-app navigation guard. */
export function useReportDirty(dirty: boolean) {
  useReportUnsaved(dirty)
  const setDirty = useContext(EditorContext)?.setDirty
  useEffect(() => {
    setDirty?.(dirty)
  }, [dirty, setDirty])
}
