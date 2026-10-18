// Path helpers for the settings forms. Paths match zod issue paths ("bankAccounts.0.iban"),
// so server errors, client checks and the inputs share one key.

type Container = Record<string, unknown> | unknown[]

export function getIn(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => (current && typeof current === 'object' ? (current as Record<string, unknown>)[key] : undefined), value)
}

/** Immutable update: copies only the objects/arrays along the path. */
export function setIn<T>(value: T, path: string, next: unknown): T {
  const [key, ...rest] = path.split('.')
  const container = value as unknown as Container
  const child = rest.length === 0 ? next : setIn((container as Record<string, unknown>)[key], rest.join('.'), next)
  if (Array.isArray(container)) {
    const copy = [...container]
    copy[Number(key)] = child
    return copy as unknown as T
  }
  return { ...(container as Record<string, unknown>), [key]: child } as T
}

/** Element id of the input for a path (also the anchor of the error summary links); the prefix keeps forms apart. */
export function fieldId(path: string, prefix = 'set'): string {
  return `${prefix}-${path.replace(/\./g, '-')}`
}
