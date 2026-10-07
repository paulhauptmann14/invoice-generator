'use client'

import { useCallback, useSyncExternalStore } from 'react'

const EVENT = 'stored-flag-change'
// Used when localStorage is unavailable (private mode, blocked site data): the toggle still works for this page view.
const memory = new Map<string, boolean>()

function read(key: string, fallback: boolean): boolean {
  try {
    const value = window.localStorage.getItem(key)
    if (value !== null) return value === '1'
  } catch {
    // fall through to the in-memory value
  }
  return memory.get(key) ?? fallback
}

/** A per-browser on/off preference in localStorage (UI convenience only, never data). */
export function useStoredFlag(key: string, fallback: boolean): [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(
    (onChange) => {
      window.addEventListener(EVENT, onChange)
      window.addEventListener('storage', onChange)
      return () => {
        window.removeEventListener(EVENT, onChange)
        window.removeEventListener('storage', onChange)
      }
    },
    () => read(key, fallback),
    () => fallback,
  )
  const set = useCallback(
    (next: boolean) => {
      memory.set(key, next)
      try {
        window.localStorage.setItem(key, next ? '1' : '0')
      } catch {
        // Not persisted across visits; the in-memory value keeps the toggle working.
      }
      window.dispatchEvent(new Event(EVENT))
    },
    [key],
  )
  return [value, set]
}
