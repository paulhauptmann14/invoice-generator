/**
 * Shared classes for list entries that open a record. The whole entry is the click target, it answers
 * on press (instantly darker) and eases back on release; hover only on devices that can hover.
 */

/** Row of a table: put on the <tr>. The row's main link stretches over it (see rowLinkClass). */
export const pressableRowClass = 'relative cursor-pointer active:bg-pressed active:duration-0'

/** The main link inside a pressable row: its ::after covers the row and carries the focus ring. */
export const rowLinkClass =
  "after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-ring"

/** Link that fills an entry of a card list (mobile). The list itself needs overflow-hidden for its corners. */
export const listLinkClass =
  'transition-colors duration-(--duration-fast) hover:bg-muted focus-visible:-outline-offset-2 active:bg-pressed active:duration-0'
