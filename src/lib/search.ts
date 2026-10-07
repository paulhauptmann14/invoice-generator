const MAX_SEARCH_LENGTH = 100

export function normalizeSearch(q: string | string[] | undefined): string {
  const raw = Array.isArray(q) ? (q[0] ?? '') : (q ?? '')
  return raw.trim().replace(/\s+/g, ' ').toLowerCase().slice(0, MAX_SEARCH_LENGTH)
}

/** Escapes LIKE/ILIKE wildcards so user input is matched literally. */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`)
}
