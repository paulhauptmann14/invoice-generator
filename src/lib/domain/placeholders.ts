/** Replaces {Name} placeholders in a single pass. Unknown placeholders are kept as-is. */
export function fillPlaceholders(text: string, values: Record<string, string>): string {
  return text.replace(/\{([A-Za-zÄÖÜäöüß]+)\}/g, (match, key: string) =>
    Object.hasOwn(values, key) ? values[key] : match,
  )
}
