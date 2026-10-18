/** Visual marker for required fields; screen readers get `aria-required` on the control instead. */
export function RequiredMark() {
  return (
    <span aria-hidden className="text-stamp">
      {' '}*
    </span>
  )
}
