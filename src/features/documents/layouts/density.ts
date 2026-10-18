/** "compact" is the layout "Kompakt": the structure of "Klassisch" with denser type and rows (spec 3d). */
export type Density = 'normal' | 'compact'

/** Room for the fixed footer below the content (mm): four columns vs. one line that may wrap to three. */
export const FOOTER_ROOM_MM: Record<Density, number> = { normal: 20, compact: 12 }

/** A footer column as one line (Kompakt): its lines joined with commas. */
export const oneLine = (column: string) =>
  column
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '')
    .join(', ')

/** One bank account as a single line of label/value pairs (table layouts, below the payment note). */
export const bankDetails = (rows: [string, string][]) => rows.map(([label, value]) => `${label} ${value}`).join(' ')
